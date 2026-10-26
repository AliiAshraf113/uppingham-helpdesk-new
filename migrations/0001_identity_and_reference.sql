-- Fresh schema only. No legacy records or school reference values are imported.
CREATE TABLE app_users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name VARCHAR(200) NULL,
  primary_email VARCHAR(254) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id),
  KEY ix_app_users_email (primary_email),
  KEY ix_app_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_user_identities (
  identity_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  provider_key VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tenant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_subject VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (identity_id),
  UNIQUE KEY uq_user_identity_provider_subject (provider_key, tenant_id, provider_subject),
  KEY ix_user_identities_user (user_id),
  CONSTRAINT fk_user_identities_user FOREIGN KEY (user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_roles (
  role_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_app_roles_key (role_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_permissions (
  permission_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  description VARCHAR(255) NOT NULL,
  PRIMARY KEY (permission_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_user_roles (
  user_id BIGINT UNSIGNED NOT NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  assignment_source ENUM('admin', 'entra_group', 'system') NOT NULL,
  source_reference VARCHAR(255) NULL,
  assigned_by_user_id BIGINT UNSIGNED NULL,
  assigned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_id),
  KEY ix_app_user_roles_role (role_id),
  CONSTRAINT fk_app_user_roles_user FOREIGN KEY (user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_app_user_roles_role FOREIGN KEY (role_id)
    REFERENCES app_roles (role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_app_user_roles_assigner FOREIGN KEY (assigned_by_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_role_permissions (
  role_id SMALLINT UNSIGNED NOT NULL,
  permission_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  PRIMARY KEY (role_id, permission_key),
  KEY ix_app_role_permissions_permission (permission_key),
  CONSTRAINT fk_app_role_permissions_role FOREIGN KEY (role_id)
    REFERENCES app_roles (role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_app_role_permissions_permission FOREIGN KEY (permission_key)
    REFERENCES app_permissions (permission_key) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE entra_group_role_mappings (
  mapping_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  group_object_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (mapping_id),
  UNIQUE KEY uq_entra_group_role (tenant_id, group_object_id, role_id),
  KEY ix_entra_group_mapping_role (role_id, is_active),
  CONSTRAINT fk_entra_group_mapping_role FOREIGN KEY (role_id)
    REFERENCES app_roles (role_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_entra_group_mapping_creator FOREIGN KEY (created_by_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE departments (
  department_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (department_id),
  UNIQUE KEY uq_departments_key (department_key),
  UNIQUE KEY uq_departments_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE buildings (
  building_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (building_id),
  UNIQUE KEY uq_buildings_key (building_key),
  UNIQUE KEY uq_buildings_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rooms (
  room_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_id BIGINT UNSIGNED NOT NULL,
  room_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (room_id),
  UNIQUE KEY uq_rooms_building_key (building_id, room_key),
  UNIQUE KEY uq_rooms_building_name (building_id, name),
  CONSTRAINT fk_rooms_building FOREIGN KEY (building_id)
    REFERENCES buildings (building_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_categories (
  category_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (category_id),
  UNIQUE KEY uq_ticket_categories_key (category_key),
  UNIQUE KEY uq_ticket_categories_name (name),
  KEY ix_ticket_categories_active_sort (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_subcategories (
  subcategory_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_id BIGINT UNSIGNED NOT NULL,
  subcategory_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (subcategory_id),
  UNIQUE KEY uq_subcategories_category_key (category_id, subcategory_key),
  UNIQUE KEY uq_subcategories_category_name (category_id, name),
  KEY ix_subcategories_active_sort (category_id, is_active, sort_order),
  CONSTRAINT fk_subcategories_category FOREIGN KEY (category_id)
    REFERENCES ticket_categories (category_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_priorities (
  priority_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  priority_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  rank_order SMALLINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (priority_id),
  UNIQUE KEY uq_ticket_priorities_key (priority_key),
  UNIQUE KEY uq_ticket_priorities_rank (rank_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_statuses (
  status_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  status_key VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  rank_order SMALLINT UNSIGNED NOT NULL,
  is_terminal BOOLEAN NOT NULL DEFAULT FALSE,
  pauses_sla BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (status_id),
  UNIQUE KEY uq_ticket_statuses_key (status_key),
  UNIQUE KEY uq_ticket_statuses_rank (rank_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE ticket_status_transitions (
  from_status_id SMALLINT UNSIGNED NOT NULL,
  to_status_id SMALLINT UNSIGNED NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (from_status_id, to_status_id),
  CONSTRAINT fk_status_transition_from FOREIGN KEY (from_status_id)
    REFERENCES ticket_statuses (status_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_status_transition_to FOREIGN KEY (to_status_id)
    REFERENCES ticket_statuses (status_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_status_transition_distinct CHECK (from_status_id <> to_status_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asset_types (
  asset_type_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  type_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(120) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (asset_type_id),
  UNIQUE KEY uq_asset_types_key (type_key),
  UNIQUE KEY uq_asset_types_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE app_settings (
  setting_key VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  value_json LONGTEXT NOT NULL,
  updated_by_user_id BIGINT UNSIGNED NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  CONSTRAINT chk_app_settings_json CHECK (JSON_VALID(value_json)),
  CONSTRAINT fk_app_settings_updater FOREIGN KEY (updated_by_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sla_calendars (
  calendar_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calendar_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (calendar_id),
  UNIQUE KEY uq_sla_calendars_key (calendar_key),
  UNIQUE KEY uq_sla_calendars_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sla_calendar_versions (
  calendar_version_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  calendar_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  timezone_name VARCHAR(64) NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (calendar_version_id),
  UNIQUE KEY uq_sla_calendar_version (calendar_id, version_number),
  CONSTRAINT fk_sla_calendar_versions_calendar FOREIGN KEY (calendar_id)
    REFERENCES sla_calendars (calendar_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sla_calendar_versions_creator FOREIGN KEY (created_by_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sla_calendar_intervals (
  calendar_version_id BIGINT UNSIGNED NOT NULL,
  weekday TINYINT UNSIGNED NOT NULL,
  interval_number TINYINT UNSIGNED NOT NULL,
  opens_at TIME NOT NULL,
  closes_at TIME NOT NULL,
  PRIMARY KEY (calendar_version_id, weekday, interval_number),
  CONSTRAINT chk_sla_interval_weekday CHECK (weekday <= 6),
  CONSTRAINT chk_sla_interval_order CHECK (closes_at > opens_at),
  CONSTRAINT fk_sla_intervals_version FOREIGN KEY (calendar_version_id)
    REFERENCES sla_calendar_versions (calendar_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sla_calendar_holidays (
  calendar_version_id BIGINT UNSIGNED NOT NULL,
  holiday_date DATE NOT NULL,
  name VARCHAR(160) NOT NULL,
  PRIMARY KEY (calendar_version_id, holiday_date),
  CONSTRAINT fk_sla_holidays_version FOREIGN KEY (calendar_version_id)
    REFERENCES sla_calendar_versions (calendar_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sla_policies (
  policy_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  policy_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (policy_id),
  UNIQUE KEY uq_sla_policies_key (policy_key),
  UNIQUE KEY uq_sla_policies_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sla_policy_versions (
  policy_version_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  policy_id BIGINT UNSIGNED NOT NULL,
  version_number INT UNSIGNED NOT NULL,
  effective_from DATETIME(3) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (policy_version_id),
  UNIQUE KEY uq_sla_policy_version (policy_id, version_number),
  CONSTRAINT fk_sla_policy_versions_policy FOREIGN KEY (policy_id)
    REFERENCES sla_policies (policy_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sla_policy_versions_creator FOREIGN KEY (created_by_user_id)
    REFERENCES app_users (user_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Generic and category-specific rules are unique through the generated zero sentinel.
CREATE TABLE sla_policy_rules (
  policy_rule_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  policy_version_id BIGINT UNSIGNED NOT NULL,
  priority_id SMALLINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NULL,
  category_scope_id BIGINT UNSIGNED AS (IFNULL(category_id, 0)) PERSISTENT,
  clock_mode ENUM('elapsed', 'business_hours') NOT NULL,
  first_response_seconds INT UNSIGNED NOT NULL,
  resolution_seconds INT UNSIGNED NOT NULL,
  calendar_version_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (policy_rule_id),
  UNIQUE KEY uq_sla_policy_rule_scope (policy_version_id, priority_id, category_scope_id),
  CONSTRAINT fk_sla_policy_rules_version FOREIGN KEY (policy_version_id)
    REFERENCES sla_policy_versions (policy_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sla_policy_rules_priority FOREIGN KEY (priority_id)
    REFERENCES ticket_priorities (priority_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sla_policy_rules_category FOREIGN KEY (category_id)
    REFERENCES ticket_categories (category_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_sla_policy_rules_calendar FOREIGN KEY (calendar_version_id)
    REFERENCES sla_calendar_versions (calendar_version_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_sla_rule_targets CHECK (first_response_seconds > 0 AND resolution_seconds > 0),
  CONSTRAINT chk_sla_rule_calendar CHECK ((clock_mode = 'business_hours' AND calendar_version_id IS NOT NULL) OR (clock_mode = 'elapsed' AND calendar_version_id IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_roles (role_key, display_name) VALUES
  ('admin', 'Admin'),
  ('it_technician', 'IT Technician'),
  ('requester', 'Staff / Requester');

INSERT INTO app_permissions (permission_key, description) VALUES
  ('ticket.create', 'Create a ticket'),
  ('ticket.read.own', 'Read tickets the user may access as requester or participant'),
  ('ticket.read.all', 'Read all tickets'),
  ('ticket.assign', 'Assign and reassign tickets'),
  ('ticket.transition', 'Change ticket status'),
  ('ticket.comment.public', 'Create a public ticket comment'),
  ('ticket.note.internal.read', 'Read internal notes when the admin participation policy allows'),
  ('ticket.note.internal.create', 'Create an immutable internal note when policy allows'),
  ('asset.read', 'Read authorized asset records'),
  ('asset.manage', 'Manage and retire asset records'),
  ('settings.manage', 'Manage reference data and service policies'),
  ('report.read', 'Read authorized service reports'),
  ('audit.read', 'Read authorized audit events');

INSERT INTO app_role_permissions (role_id, permission_key)
SELECT role_id, permission_key FROM app_roles CROSS JOIN app_permissions
WHERE app_roles.role_key = 'admin';

INSERT INTO app_role_permissions (role_id, permission_key)
SELECT role_id, permission_key FROM app_roles
CROSS JOIN app_permissions
WHERE app_roles.role_key = 'it_technician'
  AND app_permissions.permission_key IN ('ticket.read.all', 'ticket.assign', 'ticket.transition', 'ticket.comment.public', 'asset.read', 'asset.manage', 'report.read');

INSERT INTO app_role_permissions (role_id, permission_key)
SELECT role_id, permission_key FROM app_roles
CROSS JOIN app_permissions
WHERE app_roles.role_key = 'requester'
  AND app_permissions.permission_key IN ('ticket.create', 'ticket.read.own', 'ticket.comment.public');

INSERT INTO ticket_priorities (priority_key, display_name, rank_order) VALUES
  ('urgent', 'Urgent', 1),
  ('high', 'High', 2),
  ('medium', 'Medium', 3),
  ('low', 'Low', 4);

INSERT INTO ticket_statuses (status_key, display_name, rank_order, is_terminal, pauses_sla) VALUES
  ('new', 'New', 1, FALSE, FALSE),
  ('open', 'Open', 2, FALSE, FALSE),
  ('in_progress', 'In Progress', 3, FALSE, FALSE),
  ('pending', 'Pending', 4, FALSE, TRUE),
  ('resolved', 'Resolved', 5, TRUE, TRUE),
  ('closed', 'Closed', 6, TRUE, TRUE);

INSERT INTO ticket_status_transitions (from_status_id, to_status_id)
SELECT source.status_id, target.status_id
FROM ticket_statuses AS source CROSS JOIN ticket_statuses AS target
WHERE (source.status_key = 'new' AND target.status_key = 'open')
   OR (source.status_key = 'open' AND target.status_key IN ('in_progress', 'pending', 'resolved'))
   OR (source.status_key = 'in_progress' AND target.status_key IN ('pending', 'resolved'))
   OR (source.status_key = 'pending' AND target.status_key IN ('open', 'in_progress', 'resolved'))
   OR (source.status_key = 'resolved' AND target.status_key IN ('open', 'closed'));
