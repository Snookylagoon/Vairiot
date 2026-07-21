import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useSmtp, useSaveSmtp, useVerifySmtp, useTestSmtp, SmtpProvider } from '@/hooks/useSmtp';

interface FormState {
  provider: SmtpProvider;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  changePassword: boolean;
  fromAddress: string;
  active: boolean;
}

const EMPTY: FormState = {
  provider: 'smtp', host: '', port: 587, secure: false, username: '', password: '',
  changePassword: false, fromAddress: 'Vairiot <no-reply@vairiot.com>', active: true,
};

export function SmtpPage() {
  const { data, isLoading } = useSmtp();
  const save = useSaveSmtp();
  const verify = useVerifySmtp();
  const test = useTestSmtp();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [testTo, setTestTo] = useState('');
  const [lastTestResult, setLastTestResult] = useState<{ ok: boolean; messageId?: string; error?: string } | null>(null);
  const [lastVerifyResult, setLastVerifyResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setForm({
      provider: data.provider ?? 'smtp',
      host: data.host ?? '',
      port: data.port,
      secure: data.secure,
      username: data.username ?? '',
      password: '',
      changePassword: false,
      fromAddress: data.fromAddress ?? 'Vairiot <no-reply@vairiot.com>',
      active: data.active,
    });
  }, [data]);

  const handleSave = async () => {
    await save.mutateAsync({
      provider: form.provider,
      host: form.provider === 'resend' ? 'api.resend.com' : form.host.trim(),
      port: form.provider === 'resend' ? 443 : Number(form.port),
      secure: form.secure,
      username: form.provider === 'resend' ? 'resend' : (form.username.trim() || null),
      password: form.changePassword ? form.password : null,
      fromAddress: form.fromAddress.trim(),
      active: form.active,
    });
    setForm(f => ({ ...f, password: '', changePassword: false }));
  };

  const handleVerify = async () => {
    const r = await verify.mutateAsync();
    setLastVerifyResult(r);
  };

  const handleTest = async () => {
    if (!testTo.trim()) return;
    const r = await test.mutateAsync(testTo.trim());
    setLastTestResult(r);
  };

  if (isLoading) return <div className="text-gray-500">Loading email settings…</div>;

  const isResend = form.provider === 'resend';

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-h1 text-v-charcoal">Email delivery</h1>
        <div className="flex items-center gap-2">
          {data?.configured ? <Badge variant="green">Configured</Badge> : <Badge variant="yellow">Not configured</Badge>}
          {data && (data.active
            ? <Badge variant="green">Active</Badge>
            : <Badge variant="gray">Disabled</Badge>)}
        </div>
      </div>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-v-charcoal">Provider</h2>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, provider: 'smtp' }))}
              className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                !isResend
                  ? 'border-v-green bg-green-50 text-v-charcoal'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              SMTP server
              <span className="block text-xs font-normal mt-1 text-gray-400">
                Gmail, SendGrid, Mailgun, etc.
              </span>
            </button>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, provider: 'resend' }))}
              className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                isResend
                  ? 'border-v-green bg-green-50 text-v-charcoal'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              Resend
              <span className="block text-xs font-normal mt-1 text-gray-400">
                HTTP API — no SMTP ports needed
              </span>
            </button>
          </div>

          <h2 className="text-lg font-semibold text-v-charcoal pt-2">
            {isResend ? 'Resend settings' : 'Server'}
          </h2>

          {!isResend && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Input label="Host" placeholder="smtp.sendgrid.net"
                    value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} />
                </div>
                <Input label="Port" type="number" min={1} max={65535}
                  value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) || 0 }))} />
              </div>

              <label className="flex items-center gap-2 text-sm text-v-charcoal">
                <input type="checkbox" checked={form.secure}
                  onChange={e => setForm(f => ({ ...f, secure: e.target.checked }))} />
                Use implicit TLS (typical for port 465 — leave off for 587 STARTTLS)
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Username (optional)" placeholder="apikey"
                  value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Password / API key</label>
                  {data?.hasPassword && !form.changePassword ? (
                    <div className="flex items-center gap-2">
                      <code className="flex-1 px-3 py-2 bg-gray-100 rounded text-xs text-gray-500">•••••••• (stored, encrypted)</code>
                      <Button size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, changePassword: true }))}>Change</Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <Input type="password" autoComplete="new-password"
                          placeholder={data?.hasPassword ? 'New password (leave blank to clear)' : ''}
                          value={form.password}
                          onChange={e => setForm(f => ({ ...f, password: e.target.value, changePassword: true }))} />
                      </div>
                      {data?.hasPassword && (
                        <Button size="sm" variant="ghost"
                          onClick={() => setForm(f => ({ ...f, password: '', changePassword: false }))}>Cancel</Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {isResend && (
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">API key</label>
              {data?.hasPassword && !form.changePassword && data.provider === 'resend' ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-gray-100 rounded text-xs text-gray-500">•••••••• (stored, encrypted)</code>
                  <Button size="sm" variant="ghost" onClick={() => setForm(f => ({ ...f, changePassword: true }))}>Change</Button>
                </div>
              ) : (
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    <Input type="password" autoComplete="new-password"
                      placeholder="re_xxxxxxxx"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value, changePassword: true }))} />
                  </div>
                  {data?.hasPassword && data.provider === 'resend' && (
                    <Button size="sm" variant="ghost"
                      onClick={() => setForm(f => ({ ...f, password: '', changePassword: false }))}>Cancel</Button>
                  )}
                </div>
              )}
              <p className="text-xs text-gray-400 pt-1">
                Get your API key from resend.com/api-keys
              </p>
            </div>
          )}

          <Input label="From address" placeholder="Vairiot <no-reply@vairiot.com>"
            value={form.fromAddress} onChange={e => setForm(f => ({ ...f, fromAddress: e.target.value }))} />

          <label className="flex items-center gap-2 text-sm text-v-charcoal">
            <input type="checkbox" checked={form.active}
              onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
            Active (uncheck to disable email delivery — emails will fall back to env vars or JSON log)
          </label>

          <div className="pt-2">
            <Button onClick={handleSave} loading={save.isPending}>Save settings</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-v-charcoal">Verify connection</h2>
          <p className="text-sm text-gray-500">
            {isResend
              ? 'Checks the Resend API key by listing domains — no email is sent.'
              : 'Opens an SMTP connection and runs verify() — no email is sent.'}
          </p>
          <div>
            <Button variant="secondary" onClick={handleVerify} loading={verify.isPending}>Verify now</Button>
          </div>
          {lastVerifyResult && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              lastVerifyResult.ok
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {lastVerifyResult.ok ? '✓ Connection OK' : `✗ ${lastVerifyResult.error}`}
            </div>
          )}
          {data?.lastVerifiedAt && (
            <p className="text-xs text-gray-400">
              Last verified: {new Date(data.lastVerifiedAt).toLocaleString()}
            </p>
          )}
          {data?.lastVerifyError && !lastVerifyResult && (
            <div className="rounded-lg border bg-red-50 border-red-200 text-red-700 px-4 py-3 text-sm">
              Last error: {data.lastVerifyError}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-v-charcoal">Send test email</h2>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Input label="Recipient" type="email" placeholder="you@example.com"
                value={testTo} onChange={e => setTestTo(e.target.value)} />
            </div>
            <Button onClick={handleTest} loading={test.isPending} disabled={!testTo.trim()}>Send test</Button>
          </div>
          {lastTestResult && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${
              lastTestResult.ok
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {lastTestResult.ok
                ? `✓ Sent — messageId: ${lastTestResult.messageId ?? '(unknown)'}`
                : `✗ ${lastTestResult.error}`}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
