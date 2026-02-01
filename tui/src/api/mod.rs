//! API client for Glass server communication.

mod types;

pub use types::*;

use anyhow::Result;
use reqwest::Client;

/// Client for communicating with the Glass server.
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

    /// List all issues (returns cached data from DB).
    pub async fn list_issues(&self) -> Result<ListIssuesResponse> {
        let url = format!("{}/api/v1/issues", self.base_url);
        let response = self.client.get(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Refresh issues from Sentry and return updated list.
    pub async fn refresh_issues(&self) -> Result<ListIssuesResponse> {
        let url = format!("{}/api/v1/issues/refresh", self.base_url);
        let response = self.client.post(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Get issue detail (returns cached data from DB).
    pub async fn get_issue(&self, id: &str) -> Result<IssueDetail> {
        let url = format!("{}/api/v1/issues/{}", self.base_url, id);
        let response = self.client.get(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Refresh a single issue from Sentry and return updated detail.
    pub async fn refresh_issue(&self, id: &str) -> Result<IssueDetail> {
        let url = format!("{}/api/v1/issues/{}/refresh", self.base_url, id);
        let response = self.client.post(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Get session info for an issue.
    pub async fn get_session(&self, id: &str) -> Result<SessionInfo> {
        let url = format!("{}/api/v1/issues/{}/session", self.base_url, id);
        let response = self.client.get(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Start analysis on an issue.
    pub async fn analyze(&self, id: &str) -> Result<AnalyzeResponse> {
        let url = format!("{}/api/v1/issues/{}/analyze", self.base_url, id);
        let response = self.client.post(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Approve proposal.
    pub async fn approve(&self, id: &str) -> Result<ApproveResponse> {
        let url = format!("{}/api/v1/issues/{}/approve", self.base_url, id);
        let response = self.client.post(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Reject proposal.
    pub async fn reject(&self, id: &str) -> Result<RejectResponse> {
        let url = format!("{}/api/v1/issues/{}/reject", self.base_url, id);
        let response = self.client.post(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Complete review.
    pub async fn complete(&self, id: &str) -> Result<CompleteResponse> {
        let url = format!("{}/api/v1/issues/{}/complete", self.base_url, id);
        let response = self.client.post(&url).send().await?.json().await?;
        Ok(response)
    }

    /// Retry after error.
    pub async fn retry(&self, id: &str) -> Result<RetryResponse> {
        let url = format!("{}/api/v1/issues/{}/retry", self.base_url, id);
        let response = self.client.post(&url).send().await?.json().await?;
        Ok(response)
    }
}
