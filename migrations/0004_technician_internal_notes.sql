-- IT technicians need internal notes for ticket collaboration. Keep this forward-only grant separate from the initial seed.
INSERT INTO app_role_permissions (role_id, permission_key)
SELECT r.role_id, p.permission_key
FROM app_roles AS r
CROSS JOIN app_permissions AS p
WHERE r.role_key = 'it_technician'
  AND p.permission_key IN ('ticket.note.internal.read', 'ticket.note.internal.create')
  AND NOT EXISTS (
    SELECT 1
    FROM app_role_permissions AS existing
    WHERE existing.role_id = r.role_id
      AND existing.permission_key = p.permission_key
  );
