use crate::infrastructure::error::AppError;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContentFamily {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub zone_id: Uuid,
    pub zone_slug: String,
    pub zone_name: String,
    pub primary_modality_id: Option<Uuid>,
    pub viewer_slug: Option<String>,
    pub thumbnail_url: Option<String>,
    pub modality_type: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContentLabel {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub group_name: Option<String>,
    pub thumbnail_url: Option<String>,
    pub modality_id: Uuid,
    pub modality_name: String,
    pub is_primary: bool,
    pub revision: i32,
    pub published_revision: Option<i32>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PublicTopic {
    pub id: Uuid,
    pub slug: String,
    pub name: String,
    pub zone_slug: String,
    pub zone_name: String,
    pub has_article: bool,
    pub first_label_slug: Option<String>,
    pub thumbnail_url: Option<String>,
    #[sqlx(json)]
    pub labels: Vec<PublicLabel>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicLabel {
    pub id: Uuid,
    pub slug: String,
    pub title: String,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResourceInput {
    pub kind: String,
    pub title: String,
    pub url: String,
    #[serde(default)]
    pub caption: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentDocument {
    pub id: Option<Uuid>,
    pub summary: String,
    pub body_json: Value,
    pub legacy_markdown: Option<String>,
    pub access_level: String,
    pub revision: i32,
    pub published_revision: Option<i32>,
    pub published_at: Option<DateTime<Utc>>,
    pub resources: Vec<ResourceInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveDocumentInput {
    pub revision: i32,
    pub summary: String,
    pub body_json: Value,
    pub access_level: String,
    pub action: String,
    pub resources: Vec<ResourceInput>,
}

pub fn safe_resource_url(value: &str) -> bool {
    !value.chars().any(|c| c.is_control() || c == '\\')
        && (value.starts_with("https://")
            || value.starts_with("http://")
            || (value.starts_with('/') && !value.starts_with("//")))
}

fn validate_rich_value(value: &Value, depth: usize) -> bool {
    if depth > 30 {
        return false;
    }
    match value {
        Value::Array(values) => values.iter().all(|v| validate_rich_value(v, depth + 1)),
        Value::Object(values) => values.iter().all(|(key, value)| {
            if matches!(key.as_str(), "url" | "href") {
                value
                    .as_str()
                    .is_some_and(|url| url.is_empty() || safe_resource_url(url))
            } else {
                validate_rich_value(value, depth + 1)
            }
        }),
        _ => true,
    }
}

fn rich_content_has_value(value: &Value) -> bool {
    match value {
        Value::String(text) => !text.trim().is_empty(),
        Value::Array(values) => values.iter().any(rich_content_has_value),
        Value::Object(values) => {
            values.get("text").is_some_and(rich_content_has_value)
                || ["content", "children", "rows", "cells"]
                    .iter()
                    .any(|key| values.get(*key).is_some_and(rich_content_has_value))
                || values
                    .get("props")
                    .and_then(|props| props.get("url"))
                    .and_then(Value::as_str)
                    .is_some_and(|url| !url.trim().is_empty())
        }
        _ => false,
    }
}

fn collect_rich_text(value: &Value, text: &mut String) {
    match value {
        Value::String(value) => text.push_str(value),
        Value::Array(values) => {
            for value in values {
                collect_rich_text(value, text);
            }
        }
        Value::Object(values) => {
            if let Some(value) = values.get("text") {
                collect_rich_text(value, text);
            }
            for key in ["content", "children", "rows", "cells"] {
                if let Some(value) = values.get(key) {
                    collect_rich_text(value, text);
                }
            }
            if values.contains_key("children") {
                text.push(' ');
            }
        }
        _ => {}
    }
}

impl SaveDocumentInput {
    // Free article saves update the viewer immediately; protected content stays private.
    pub fn public_viewer_description(&self) -> (Option<String>, Option<String>) {
        if !matches!(self.action.as_str(), "save" | "publish") || self.access_level != "free" {
            return (None, None);
        }
        let summary = if self.summary.trim().is_empty() {
            let mut text = String::new();
            collect_rich_text(&self.body_json, &mut text);
            let excerpt = text.split_whitespace().collect::<Vec<_>>().join(" ");
            if excerpt.is_empty() {
                "Open full description.".to_owned()
            } else {
                excerpt.chars().take(300).collect()
            }
        } else {
            self.summary.trim().to_owned()
        };
        (Some(summary), Some(self.body_json.to_string()))
    }

    pub fn validate(&self) -> Result<(), AppError> {
        if self.revision < 0
            || self.summary.len() > 3000
            || !matches!(self.action.as_str(), "save" | "publish" | "unpublish")
            || !matches!(self.access_level.as_str(), "free" | "subscription")
        {
            return Err(AppError::bad_request("Invalid document settings"));
        }
        let blocks = self
            .body_json
            .as_array()
            .ok_or_else(|| AppError::bad_request("Document must be a BlockNote block array"))?;
        if blocks.len() > 5000
            || self.body_json.to_string().len() > 2_000_000
            || !blocks.iter().all(|block| {
                block.is_object() && block.get("type").and_then(Value::as_str).is_some()
            })
            || !validate_rich_value(&self.body_json, 0)
        {
            return Err(AppError::bad_request("Invalid or oversized document"));
        }
        if self.resources.len() > 100
            || self.resources.iter().any(|r| {
                !matches!(
                    r.kind.as_str(),
                    "reference" | "image" | "video" | "link" | "model"
                ) || r.title.trim().is_empty()
                    || r.title.len() > 300
                    || r.caption.len() > 3000
                    || r.url.len() > 2048
                    || !safe_resource_url(&r.url)
            })
        {
            return Err(AppError::bad_request("Invalid document resources"));
        }
        if self.action == "publish"
            && !rich_content_has_value(&self.body_json)
            && self.summary.trim().is_empty()
        {
            return Err(AppError::bad_request("Add content before publishing"));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn input() -> SaveDocumentInput {
        serde_json::from_value(json!({"revision":0,"summary":"Brain","bodyJson":[
            {"type":"heading","props":{"level":2},"content":[{"type":"text","text":"Overview","styles":{"bold":true}}]},
            {"type":"image","props":{"url":"https://example.org/brain.png"},"children":[]}
        ],"accessLevel":"free","action":"publish","resources":[]})).unwrap()
    }
    #[test]
    fn accepts_native_blocks_without_flattening_styles_or_media() {
        let document = input();
        assert!(document.validate().is_ok());
        assert_eq!(document.body_json[0]["content"][0]["styles"]["bold"], true);
    }
    #[test]
    fn rejects_unsafe_nested_links_and_resource_urls() {
        let mut document = input();
        document.body_json[0]["content"] =
            json!([{"type":"link","href":"javascript:alert(1)","content":[]}]);
        assert!(document.validate().is_err());
        assert!(!safe_resource_url("//evil.example/a"));
        assert!(!safe_resource_url("/\\evil.example/a"));
        assert!(safe_resource_url("/api/v1/public/playground/assets/1"));
    }
    #[test]
    fn rejects_invalid_revision_action_and_empty_publication() {
        let mut document = input();
        document.revision = -1;
        assert!(document.validate().is_err());
        document.revision = 0;
        document.action = "delete".into();
        assert!(document.validate().is_err());
        document.action = "publish".into();
        document.summary.clear();
        document.body_json = json!([]);
        assert!(document.validate().is_err());
        document.body_json = json!([{"type":"paragraph","content":[],"children":[]}]);
        assert!(document.validate().is_err());
    }
    #[test]
    fn private_or_unpublished_bodies_never_reach_the_legacy_public_viewer() {
        let mut document = input();
        document.access_level = "subscription".into();
        assert_eq!(document.public_viewer_description(), (None, None));
        document.access_level = "free".into();
        document.action = "unpublish".into();
        assert_eq!(document.public_viewer_description(), (None, None));
    }
    #[test]
    fn native_body_only_articles_have_a_plain_text_viewer_excerpt() {
        let mut document = input();
        document.summary.clear();
        let (summary, body) = document.public_viewer_description();
        assert_eq!(summary.as_deref(), Some("Overview"));
        assert_eq!(
            body.as_deref(),
            Some(document.body_json.to_string().as_str())
        );
    }
    #[test]
    fn free_saves_update_the_viewer_without_a_publish_step() {
        let mut document = input();
        document.action = "save".into();
        let (summary, body) = document.public_viewer_description();
        assert_eq!(summary.as_deref(), Some("Brain"));
        assert!(body.is_some());
        document.access_level = "subscription".into();
        assert_eq!(document.public_viewer_description(), (None, None));
    }
}
