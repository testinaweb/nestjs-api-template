CREATE TABLE tasks (
  id         char(26)     PRIMARY KEY DEFAULT generate_ulid(),
  title      varchar(255) NOT NULL,
  done       boolean      NOT NULL DEFAULT false,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
