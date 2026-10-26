CREATE TABLE assets (
  asset_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_tag VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  serial_number VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NULL,
  manufacturer VARCHAR(160) NULL,
  model VARCHAR(160) NULL,
  asset_type_id BIGINT UNSIGNED NOT NULL,
  purchase_date DATE NULL,
  warranty_expires_on DATE NULL,
  department_id BIGINT UNSIGNED NULL,
  building_id BIGINT UNSIGNED NULL,
  room_id BIGINT UNSIGNED NULL,
  assigned_user_id BIGINT UNSIGNED NULL,
  status ENUM('in_stock', 'assigned', 'maintenance', 'retired') NOT NULL DEFAULT 'in_stock',
  retired_at DATETIME(3) NULL,
  retired_by_user_id BIGINT UNSIGNED NULL,
  retirement_reason VARCHAR(1000) NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (asset_id),
  UNIQUE KEY uq_assets_tag (asset_tag),
  UNIQUE KEY uq_assets_serial (serial_number),
  KEY ix_assets_type_status (asset_type_id, status),
  KEY ix_assets_assigned_user (assigned_user_id, status),
  KEY ix_assets_department (department_id, status),
  KEY ix_assets_building_room (building_id, room_id),
  CONSTRAINT fk_assets_type FOREIGN KEY (asset_type_id)
    REFERENCES asset_types (asset_type_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assets_department FOREIGN KEY (department_id)
    REFERENCES departments (department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assets_building FOREIGN KEY (building_id)
    REFERENCES buildings (building_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assets_room FOREIGN KEY (room_id)
    REFERENCES rooms (room_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assets_assigned_user FOREIGN KEY (assigned_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assets_retired_by FOREIGN KEY (retired_by_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_assets_creator FOREIGN KEY (created_by_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_assets_retirement CHECK (status <> 'retired' OR (assigned_user_id IS NULL AND retired_at IS NOT NULL AND retirement_reason IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tickets (
  ticket_number BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(255) NOT NULL,
  description MEDIUMTEXT NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  subcategory_id BIGINT UNSIGNED NULL,
  requester_user_id BIGINT UNSIGNED NOT NULL,
  assignee_user_id BIGINT UNSIGNED NULL,
  department_id BIGINT UNSIGNED NULL,
  building_id BIGINT UNSIGNED NULL,
  room_id BIGINT UNSIGNED NULL,
  asset_id BIGINT UNSIGNED NULL,
  priority_id SMALLINT UNSIGNED NOT NULL,
  status_id SMALLINT UNSIGNED NOT NULL,
  first_response_at DATETIME(3) NULL,
  resolved_at DATETIME(3) NULL,
  closed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (ticket_number),
  KEY ix_tickets_requester_created (requester_user_id, created_at),
  KEY ix_tickets_assignee_status (assignee_user_id, status_id, updated_at),
  KEY ix_tickets_status_created (status_id, created_at),
  KEY ix_tickets_priority_status (priority_id, status_id),
  KEY ix_tickets_category_created (category_id, created_at),
  KEY ix_tickets_department_created (department_id, created_at),
  KEY ix_tickets_building_room (building_id, room_id),
  CONSTRAINT fk_tickets_category FOREIGN KEY (category_id)
    REFERENCES ticket_categories (category_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_subcategory FOREIGN KEY (subcategory_id)
    REFERENCES ticket_subcategories (subcategory_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_requester FOREIGN KEY (requester_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_assignee FOREIGN KEY (assignee_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_department FOREIGN KEY (department_id)
    REFERENCES departments (department_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_building FOREIGN KEY (building_id)
    REFERENCES buildings (building_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_room FOREIGN KEY (room_id)
    REFERENCES rooms (room_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_asset FOREIGN KEY (asset_id)
    REFERENCES assets (asset_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_priority FOREIGN KEY (priority_id)
    REFERENCES ticket_priorities (priority_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_tickets_status FOREIGN KEY (status_id)
    REFERENCES ticket_statuses (status_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_sla_snapshots (
  ticket_number BIGINT UNSIGNED NOT NULL,
  policy_rule_id BIGINT UNSIGNED NOT NULL,
  first_response_target_seconds INT UNSIGNED NOT NULL,
  resolution_target_seconds INT UNSIGNED NOT NULL,
  clock_mode ENUM('elapsed', 'business_hours') NOT NULL,
  first_response_due_at DATETIME(3) NOT NULL,
  resolution_due_at DATETIME(3) NOT NULL,
  paused_seconds BIGINT UNSIGNED NOT NULL DEFAULT 0,
  pause_started_at DATETIME(3) NULL,
  policy_snapshot_json LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (ticket_number),
  KEY ix_ticket_sla_first_response_due (first_response_due_at),
  KEY ix_ticket_sla_resolution_due (resolution_due_at),
  CONSTRAINT chk_ticket_sla_snapshot_json CHECK (JSON_VALID(policy_snapshot_json)),
  CONSTRAINT fk_ticket_sla_snapshot_ticket FOREIGN KEY (ticket_number)
    REFERENCES tickets (ticket_number) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_ticket_sla_snapshot_rule FOREIGN KEY (policy_rule_id)
    REFERENCES sla_policy_rules (policy_rule_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
