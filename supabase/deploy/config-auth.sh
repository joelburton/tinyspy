#!/usr/bin/env bash
# Step 4 — auth config: site URL, redirect allowlist, Resend SMTP, and
# the magic-link email template.
#
# PATCH /v1/projects/{ref}/config/auth
# https://supabase.com/docs/reference/api/v1-update-auth-service-config
#
# All-or-nothing: if any of SITE_URL / RESEND_API_KEY /
# SMTP_SENDER_EMAIL is still a placeholder the whole step is skipped,
# because a half-configured auth service is worse than an unconfigured
# one (the dashboard's URL Configuration / SMTP / Email Templates pages
# remain the fallback).

. "$(dirname "$0")/env.sh"
require_project

for v in "${SITE_URL:-}" "${RESEND_API_KEY:-}" "${SMTP_SENDER_EMAIL:-}"; do
  if [[ -z "$v" || "$v" == *"REPLACE-WITH"* ]]; then
    say "4. Skipping auth config (SITE_URL / RESEND_API_KEY / SMTP_SENDER_EMAIL incomplete)"
    echo "    Fill them in the secrets file, or use the dashboard."
    exit 0
  fi
done

say "4. Configuring auth (site URL, SMTP, email template)"
# This PATCHes the project, so say which one — same habit as config-api.sh.
announce_target

# Both the {{ .ConfirmationURL }} link and the {{ .Token }} code are
# surfaced so a player can sign in cross-device — open the mail on a
# phone, type the code on the laptop. Supabase substitutes both when it
# renders. Single-quoted so nothing here expands: the {{ }} must reach
# Supabase intact.
magic_link_html='<h2>Sign in to PuzPuzPuz</h2>
<p>Click the link to sign in:</p>
<p><a href="{{ .ConfirmationURL }}">Sign in to PuzPuzPuz</a></p>
<p>Or enter this code on the sign-in page:</p>
<p style="font-size: 24px; font-family: monospace; letter-spacing: 4px;">{{ .Token }}</p>
<p style="color: #666; font-size: 12px;">
This code expires in 1 hour. If you did not request this, ignore the email.
</p>'

# jq builds the payload so the HTML's quotes, braces and newlines are
# escaped safely. `uri_allow_list` takes wildcards — `$SITE_URL/*` keeps
# deploy-preview URLs from being rejected.
#
# BOTH templates are set to the same body. Supabase treats a magic-link
# sign-in from a never-seen address as a SIGNUP, so first-time players
# get the confirmation template and everyone else gets the magic-link
# one; in a magic-link-only app the two must read identically.
payload=$(jq -n \
  --arg site_url "$SITE_URL" \
  --arg uri_allow_list "${SITE_URL},${SITE_URL}/*" \
  --arg smtp_admin_email "$SMTP_SENDER_EMAIL" \
  --arg smtp_pass "$RESEND_API_KEY" \
  --arg smtp_sender_name "${SMTP_SENDER_NAME:-PuzPuzPuz}" \
  --arg magic_template "$magic_link_html" \
  '{
    site_url: $site_url,
    uri_allow_list: $uri_allow_list,
    smtp_admin_email: $smtp_admin_email,
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: $smtp_pass,
    smtp_sender_name: $smtp_sender_name,
    smtp_max_frequency: 60,
    mailer_subjects_magic_link:            "Sign in to PuzPuzPuz",
    mailer_templates_magic_link_content:   $magic_template,
    mailer_subjects_confirmation:          "Sign in to PuzPuzPuz",
    mailer_templates_confirmation_content: $magic_template
  }')

api -X PATCH "https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth" \
  -d @- <<< "$payload" >/dev/null
echo "    site URL=${SITE_URL}; SMTP=smtp.resend.com (Resend)."
echo "    NOTE: Resend won't deliver until the sender domain is verified"
echo "          in the Resend dashboard (DNS, one-time per domain)."
