//! Background task management - spawning async tasks and receiving results.

use std::sync::Arc;
use tokio::sync::mpsc;
use futures_util::StreamExt;
use reqwest_eventsource::{Event, EventSource};
use tracing::{debug, error, info, warn};

use crate::api::{AnalysisEvent, ApiClient, IssueDetail, ListIssuesResponse};

/// Messages from background tasks.
pub enum BackgroundMessage {
    /// List refresh completed with result
    ListRefreshComplete(Result<ListIssuesResponse, String>),
    /// Detail refresh completed with result
    DetailRefreshComplete(Result<IssueDetail, String>),
    /// Analysis event received from SSE
    AnalysisEvent(AnalysisEvent),
    /// Analysis SSE stream ended (connected or error)
    AnalysisStreamEnded(Option<String>),
}

/// Manages background task communication.
pub struct BackgroundTasks {
    /// API client for server communication
    client: Arc<ApiClient>,
    /// Channel receiver for background task results
    rx: mpsc::Receiver<BackgroundMessage>,
    /// Channel sender for background tasks (cloned into spawned tasks)
    tx: mpsc::Sender<BackgroundMessage>,
}

impl BackgroundTasks {
    pub fn new(server_url: String) -> Self {
        let (tx, rx) = mpsc::channel(64);
        Self {
            client: Arc::new(ApiClient::new(server_url)),
            rx,
            tx,
        }
    }

    /// Get a reference to the API client.
    pub fn client(&self) -> &ApiClient {
        &self.client
    }

    /// Poll for background task completions.
    /// Returns an iterator of all pending messages.
    pub fn poll(&mut self) -> Vec<BackgroundMessage> {
        let mut messages = Vec::new();
        while let Ok(msg) = self.rx.try_recv() {
            messages.push(msg);
        }
        messages
    }

    /// Spawn a background task to refresh the issue list from Sentry.
    pub fn spawn_list_refresh(&self) {
        let client = Arc::clone(&self.client);
        let tx = self.tx.clone();

        tokio::spawn(async move {
            let result = client
                .refresh_issues()
                .await
                .map_err(|e| format!("Failed to refresh issues: {}", e));

            let _ = tx.send(BackgroundMessage::ListRefreshComplete(result)).await;
        });
    }

    /// Spawn a background task to refresh issue detail from Sentry.
    pub fn spawn_detail_refresh(&self, issue_id: String) {
        let client = Arc::clone(&self.client);
        let tx = self.tx.clone();

        tokio::spawn(async move {
            let result = client
                .refresh_issue(&issue_id)
                .await
                .map_err(|e| format!("Failed to refresh issue: {}", e));

            let _ = tx.send(BackgroundMessage::DetailRefreshComplete(result)).await;
        });
    }

    /// Start the SSE stream for analysis events.
    pub fn spawn_analysis_stream(&self, issue_id: &str) {
        let url = self.client.events_url(issue_id);
        let tx = self.tx.clone();

        info!(%url, "Starting SSE stream for analysis events");

        tokio::spawn(async move {
            let mut es = EventSource::get(&url);

            while let Some(event) = es.next().await {
                match event {
                    Ok(Event::Open) => {
                        info!("SSE connection opened");
                    }
                    Ok(Event::Message(message)) => {
                        debug!(data_len = message.data.len(), "Received SSE message");
                        if message.data.len() > 500 {
                            debug!(data_preview = %&message.data[..500], "SSE data preview");
                        } else {
                            debug!(data = %message.data, "SSE data");
                        }

                        match serde_json::from_str::<AnalysisEvent>(&message.data) {
                            Ok(event) => {
                                debug!(?event, "Parsed analysis event");
                                if tx.send(BackgroundMessage::AnalysisEvent(event)).await.is_err() {
                                    warn!("Failed to send event to channel, receiver dropped");
                                    break;
                                }
                            }
                            Err(e) => {
                                error!(%e, data = %message.data, "Failed to parse SSE event");
                                let _ = tx
                                    .send(BackgroundMessage::AnalysisStreamEnded(Some(format!(
                                        "Parse error: {}",
                                        e
                                    ))))
                                    .await;
                                break;
                            }
                        }
                    }
                    Err(e) => {
                        let err_str = e.to_string();
                        let is_normal_end = err_str.contains("end of stream")
                            || err_str.contains("Stream ended")
                            || err_str.contains("EOF");
                        if !is_normal_end {
                            error!(%err_str, "SSE stream error");
                            let _ = tx
                                .send(BackgroundMessage::AnalysisStreamEnded(Some(err_str)))
                                .await;
                        } else {
                            info!("SSE stream ended normally");
                            let _ = tx.send(BackgroundMessage::AnalysisStreamEnded(None)).await;
                        }
                        break;
                    }
                }
            }

            info!("SSE stream task completed");
            let _ = tx.send(BackgroundMessage::AnalysisStreamEnded(None)).await;
        });
    }
}
