//! API client for Glass server communication.

mod types;

pub use types::*;

use anyhow::{Context, Result};
use reqwest::Client;
use tracing::{debug, error};

/// Client for communicating with the Glass server.
#[derive(Clone)]
pub struct ApiClient {
    base_url: String,
    client: Client,
}

impl ApiClient {
    pub fn new(base_url: String) -> Self {
        Self {
            base_url,
            client: Client::new(),
        }
    }

    /// Get the events URL for SSE subscription.
    pub fn events_url(&self, id: &str) -> String {
        format!("{}/api/v1/issues/{}/events", self.base_url, id)
    }

    /// Helper to make a GET request and parse JSON response with logging.
    async fn get_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T> {
        debug!(%url, "GET request");
        let response = self.client.get(url).send().await?;
        let status = response.status();
        let body = response.text().await?;
        debug!(%status, body_len = body.len(), "Response received");

        if !status.is_success() {
            error!(%status, %body, "Request failed");
            anyhow::bail!("Request failed with status {}: {}", status, body);
        }

        serde_json::from_str(&body).with_context(|| {
            error!(%body, "Failed to parse response");
            format!("Failed to parse response from {}", url)
        })
    }

    /// Helper to make a POST request and parse JSON response with logging.
    async fn post_json<T: serde::de::DeserializeOwned>(&self, url: &str) -> Result<T> {
        debug!(%url, "POST request");
        let response = self.client.post(url).send().await?;
        let status = response.status();
        let body = response.text().await?;
        debug!(%status, body_len = body.len(), "Response received");

        if !status.is_success() {
            error!(%status, %body, "Request failed");
            anyhow::bail!("Request failed with status {}: {}", status, body);
        }

        serde_json::from_str(&body).with_context(|| {
            error!(%body, "Failed to parse response");
            format!("Failed to parse response from {}", url)
        })
    }

    /// List all issues (returns cached data from DB).
    pub async fn list_issues(&self) -> Result<ListIssuesResponse> {
        let url = format!("{}/api/v1/issues", self.base_url);
        self.get_json(&url).await
    }

    /// Refresh issues from Sentry and return updated list.
    pub async fn refresh_issues(&self) -> Result<ListIssuesResponse> {
        let url = format!("{}/api/v1/issues/refresh", self.base_url);
        self.post_json(&url).await
    }

    /// Get issue detail (returns cached data from DB).
    pub async fn get_issue(&self, id: &str) -> Result<IssueDetail> {
        let url = format!("{}/api/v1/issues/{}", self.base_url, id);
        self.get_json(&url).await
    }

    /// Refresh a single issue from Sentry and return updated detail.
    pub async fn refresh_issue(&self, id: &str) -> Result<IssueDetail> {
        let url = format!("{}/api/v1/issues/{}/refresh", self.base_url, id);
        self.post_json(&url).await
    }

    /// Get session info for an issue.
    pub async fn get_session(&self, id: &str) -> Result<SessionInfo> {
        let url = format!("{}/api/v1/issues/{}/session", self.base_url, id);
        self.get_json(&url).await
    }

    /// Start analysis on an issue.
    pub async fn analyze(&self, id: &str) -> Result<AnalyzeResponse> {
        let url = format!("{}/api/v1/issues/{}/analyze", self.base_url, id);
        self.post_json(&url).await
    }

    /// Approve proposal.
    pub async fn approve(&self, id: &str) -> Result<ApproveResponse> {
        let url = format!("{}/api/v1/issues/{}/approve", self.base_url, id);
        self.post_json(&url).await
    }

    /// Reject proposal.
    pub async fn reject(&self, id: &str) -> Result<RejectResponse> {
        let url = format!("{}/api/v1/issues/{}/reject", self.base_url, id);
        self.post_json(&url).await
    }

    /// Complete review.
    pub async fn complete(&self, id: &str) -> Result<CompleteResponse> {
        let url = format!("{}/api/v1/issues/{}/complete", self.base_url, id);
        self.post_json(&url).await
    }

    /// Retry after error.
    pub async fn retry(&self, id: &str) -> Result<RetryResponse> {
        let url = format!("{}/api/v1/issues/{}/retry", self.base_url, id);
        self.post_json(&url).await
    }
}
