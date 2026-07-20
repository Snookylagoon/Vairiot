-- Per-user permission overrides on top of role-derived permissions.
-- granted = true → permission is added to the user's effective set.
-- granted = false → permission is removed from the user's effective set.

CREATE TABLE "user_permission_overrides" (
  "userId"     TEXT NOT NULL,
  "permission" TEXT NOT NULL,
  "granted"    BOOLEAN NOT NULL,
  "grantedBy"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,

  CONSTRAINT "user_permission_overrides_pkey" PRIMARY KEY ("userId", "permission")
);

CREATE INDEX "user_permission_overrides_userId_idx" ON "user_permission_overrides"("userId");

ALTER TABLE "user_permission_overrides"
  ADD CONSTRAINT "user_permission_overrides_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
