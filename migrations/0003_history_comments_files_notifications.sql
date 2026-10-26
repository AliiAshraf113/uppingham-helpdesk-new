CREATE TABLE asset_history (
  asset_history_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  action_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  reason VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (asset_history_id),
  KEY ix_asset_history_asset_created (asset_id, created_at),
  KEY ix_asset_history_actor_created (actor_user_id, created_at),
  CONSTRAINT chk_asset_history_before_json CHECK (before_json IS NULL OR JSON_VALID(before_json)),
  CONSTRAINT chk_asset_history_after_json CHECK (after_json IS NULL OR JSON_VALID(after_json)),
  CONSTRAINT fk_asset_history_asset FOREIGN KEY (asset_id)
    REFERENCES assets (asset_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_asset_history_actor FOREIGN KEY (actor_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_comments (
  comment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_number BIGINT UNSIGNED NOT NULL,
  author_user_id BIGINT UNSIGNED NOT NULL,
  visibility ENUM('public', 'internal') NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (comment_id),
  KEY ix_ticket_comments_timeline (ticket_number, created_at),
  KEY ix_ticket_comments_author (author_user_id, created_at),
  CONSTRAINT fk_ticket_comments_ticket FOREIGN KEY (ticket_number)
    REFERENCES tickets (ticket_number) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ticket_comments_author FOREIGN KEY (author_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_activity (
  activity_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_number BIGINT UNSIGNED NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  event_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (activity_id),
  KEY ix_ticket_activity_timeline (ticket_number, created_at),
  KEY ix_ticket_activity_actor (actor_user_id, created_at),
  CONSTRAINT chk_ticket_activity_before_json CHECK (before_json IS NULL OR JSON_VALID(before_json)),
  CONSTRAINT chk_ticket_activity_after_json CHECK (after_json IS NULL OR JSON_VALID(after_json)),
  CONSTRAINT fk_ticket_activity_ticket FOREIGN KEY (ticket_number)
    REFERENCES tickets (ticket_number) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ticket_activity_actor FOREIGN KEY (actor_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_events (
  audit_event_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resource_type VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resource_id VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (audit_event_id),
  KEY ix_audit_resource_created (resource_type, resource_id, created_at),
  KEY ix_audit_actor_created (actor_user_id, created_at),
  KEY ix_audit_created (created_at),
  CONSTRAINT chk_audit_before_json CHECK (before_json IS NULL OR JSON_VALID(before_json)),
  CONSTRAINT chk_audit_after_json CHECK (after_json IS NULL OR JSON_VALID(after_json)),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_attachments (
  attachment_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  storage_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  ticket_number BIGINT UNSIGNED NULL,
  uploader_user_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  detected_content_type VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  state ENUM('available', 'attached', 'quarantined', 'deleting') NOT NULL DEFAULT 'available',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  attached_at DATETIME(3) NULL,
  PRIMARY KEY (attachment_id),
  UNIQUE KEY uq_ticket_attachments_storage_key (storage_key),
  KEY ix_ticket_attachments_ticket (ticket_number, created_at),
  KEY ix_ticket_attachments_uploader (uploader_user_id, created_at),
  CONSTRAINT chk_ticket_attachments_size CHECK (size_bytes > 0),
  CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_number)
    REFERENCES tickets (ticket_number) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ticket_attachments_uploader FOREIGN KEY (uploader_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_upload_reservations (
  reservation_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  storage_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  uploader_user_id BIGINT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  declared_content_type VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expected_size BIGINT UNSIGNED NOT NULL,
  received_size BIGINT UNSIGNED NULL,
  status ENUM('reserved', 'uploading', 'attached', 'cleanup', 'failed', 'expired') NOT NULL DEFAULT 'reserved',
  attachment_id BIGINT UNSIGNED NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (reservation_id),
  UNIQUE KEY uq_upload_reservation_token_hash (reservation_token_hash),
  UNIQUE KEY uq_upload_reservation_storage_key (storage_key),
  KEY ix_upload_reservations_expiry_status (status, expires_at),
  KEY ix_upload_reservations_uploader (uploader_user_id, created_at),
  CONSTRAINT chk_upload_reservation_expected_size CHECK (expected_size > 0),
  CONSTRAINT chk_upload_reservation_received_size CHECK (received_size IS NULL OR received_size <= expected_size),
  CONSTRAINT fk_upload_reservations_uploader FOREIGN KEY (uploader_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_upload_reservations_attachment FOREIGN KEY (attachment_id)
    REFERENCES ticket_attachments (attachment_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  ticket_number BIGINT UNSIGNED NULL,
  event_key VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  dedupe_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  template_data_json LONGTEXT NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (notification_id),
  UNIQUE KEY uq_notifications_dedupe (dedupe_key),
  KEY ix_notifications_recipient_unread (recipient_user_id, read_at, created_at),
  KEY ix_notifications_ticket (ticket_number, created_at),
  CONSTRAINT chk_notifications_template_data CHECK (JSON_VALID(template_data_json)),
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_notifications_ticket FOREIGN KEY (ticket_number)
    REFERENCES tickets (ticket_number) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
