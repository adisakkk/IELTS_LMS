-- Add wcode support for exam registration

-- Add wcode to schedule_registrations
ALTER TABLE schedule_registrations 
ADD COLUMN IF NOT EXISTS wcode text NOT NULL DEFAULT '';

-- Add wcode format constraint (allows empty for migration)
ALTER TABLE schedule_registrations 
DROP CONSTRAINT IF EXISTS schedule_registrations_wcode_format;
ALTER TABLE schedule_registrations 
ADD CONSTRAINT schedule_registrations_wcode_format 
CHECK (wcode ~ '^W[0-9]{6}$' OR wcode = '');

-- Add unique constraint on wcode per schedule
ALTER TABLE schedule_registrations 
DROP CONSTRAINT IF EXISTS schedule_registrations_wcode_unique;
ALTER TABLE schedule_registrations 
ADD CONSTRAINT schedule_registrations_wcode_unique 
UNIQUE (schedule_id, wcode);

-- Make student_email required (set NOT NULL with default empty string)
ALTER TABLE schedule_registrations 
ALTER COLUMN student_email SET NOT NULL,
ALTER COLUMN student_email SET DEFAULT '';

-- Add wcode to student_attempts
ALTER TABLE student_attempts 
ADD COLUMN IF NOT EXISTS wcode text NOT NULL DEFAULT '';

-- Add wcode format constraint
ALTER TABLE student_attempts 
DROP CONSTRAINT IF EXISTS student_attempts_wcode_format;
ALTER TABLE student_attempts 
ADD CONSTRAINT student_attempts_wcode_format 
CHECK (wcode ~ '^W[0-9]{6}$' OR wcode = '');

-- Create indexes for wcode lookups
CREATE INDEX IF NOT EXISTS idx_schedule_registrations_wcode ON schedule_registrations(wcode);
CREATE INDEX IF NOT EXISTS idx_student_attempts_wcode ON student_attempts(wcode);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON schedule_registrations TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON student_attempts TO app_runtime;
