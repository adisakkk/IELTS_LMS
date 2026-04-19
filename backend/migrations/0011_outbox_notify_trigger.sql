-- Add PostgreSQL NOTIFY trigger for immediate outbox wakeups.
-- The worker listens on a dedicated channel and drains the outbox table itself.

CREATE OR REPLACE FUNCTION notify_outbox_wakeup()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('backend_outbox_wakeup', 'wake');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_outbox_wakeup ON outbox_events;
CREATE TRIGGER trigger_outbox_wakeup
AFTER INSERT ON outbox_events
FOR EACH ROW
EXECUTE FUNCTION notify_outbox_wakeup();

COMMENT ON FUNCTION notify_outbox_wakeup() IS 'Sends pg_notify on outbox insert for immediate worker wakeups';
COMMENT ON TRIGGER trigger_outbox_wakeup ON outbox_events IS 'Fires notify_outbox_wakeup() on each INSERT for worker wakeups';
