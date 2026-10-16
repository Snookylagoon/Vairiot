-- Mandatory two-factor for administrators (decision D6, stage 1.18): when the
-- grace period of a user who must enrol began (first sign-in after the rule).
ALTER TABLE "users" ADD COLUMN "twoFactorGraceStartedAt" TIMESTAMP(3);
