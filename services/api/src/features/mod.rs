pub mod analytics;
pub mod content;
pub mod health;
pub mod image_library;
pub mod modules;
pub mod playground;

#[cfg(test)]
mod tests {
    use serde_json::json;

    use crate::features::analytics::domain::models::AnalyticsEventInput;

    #[test]
    fn modality_article_engagement_does_not_require_a_label() {
        let mut payload = json!({
            "eventId":"a47ac10b-58cc-4372-a567-0e02b2c3d479", "eventName":"content_engaged",
            "occurredAt":"2026-09-30T10:00:00Z", "visitorId":"b47ac10b-58cc-4372-a567-0e02b2c3d480",
            "properties":{"contentId":"c47ac10b-58cc-4372-a567-0e02b2c3d481", "modalityId":"d47ac10b-58cc-4372-a567-0e02b2c3d482",
                "zoneId":"e47ac10b-58cc-4372-a567-0e02b2c3d483", "durationSeconds":30, "threshold":"30_seconds"}
        });
        let event: AnalyticsEventInput = serde_json::from_value(payload.clone()).unwrap();
        assert!(event.validate().is_ok());
        payload["properties"]["structureId"] = json!("invalid");
        let event: AnalyticsEventInput = serde_json::from_value(payload).unwrap();
        assert!(event.validate().is_err());
    }

    #[test]
    fn analytics_event_validation_accepts_known_events_and_rejects_bad_identifiers() {
        let valid: AnalyticsEventInput = serde_json::from_value(json!({
            "eventId": "a47ac10b-58cc-4372-a567-0e02b2c3d479",
            "eventName": "page_view",
            "occurredAt": "2026-09-26T10:00:00Z",
            "originalReferrer": null,
            "properties": { "path": "/head/brain-mri", "title": "Brain MRI" },
            "sessionReferrer": null,
            "visitorId": "b47ac10b-58cc-4372-a567-0e02b2c3d480"
        }))
        .expect("valid analytics payload should deserialize");
        assert!(valid.validate().is_ok());

        let invalid_content: AnalyticsEventInput = serde_json::from_value(json!({
            "eventId": "a47ac10b-58cc-4372-a567-0e02b2c3d479",
            "eventName": "content_engaged",
            "occurredAt": "2026-09-26T10:00:00Z",
            "originalReferrer": null,
            "properties": {
                "contentId": "not-a-uuid",
                "durationSeconds": 30,
                "modalityId": "c47ac10b-58cc-4372-a567-0e02b2c3d481",
                "structureId": "d47ac10b-58cc-4372-a567-0e02b2c3d482",
                "threshold": "30_seconds",
                "zoneId": "e47ac10b-58cc-4372-a567-0e02b2c3d483"
            },
            "sessionReferrer": null,
            "visitorId": "b47ac10b-58cc-4372-a567-0e02b2c3d480"
        }))
        .expect("shape should deserialize before semantic validation");
        assert!(invalid_content.validate().is_err());
    }
}
