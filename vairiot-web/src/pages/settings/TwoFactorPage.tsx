import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Input } from '@/components/ui/Input';
import {
  useTwoFactorStatus,
  useSetupTwoFactor,
  useVerifyTwoFactor,
  useDisableTwoFactor,
  type TwoFactorSetup,
} from '@/hooks/useTwoFactor';


export function TwoFactorPage() {
  const { data: status, isLoading } = useTwoFactorStatus();
  const [setupData, setSetupData] = useState<TwoFactorSetup | null>(null);
  const [verifyToken, setVerifyToken] = useState('');
  const [showDisable, setShowDisable] = useState(false);

  const setupMutation   = useSetupTwoFactor();
  const verifyMutation  = useVerifyTwoFactor();
  const disableMutation = useDisableTwoFactor();

  if (isLoading) return <div className="animate-pulse bg-gray-100 rounded-2xl h-32" />;

  const beginSetup = async () => {
    try {
      const data = await setupMutation.mutateAsync();
      setSetupData(data);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Setup failed');
    }
  };

  const verify = async () => {
    try {
      await verifyMutation.mutateAsync(verifyToken);
      toast.success('Two-factor authentication enabled');
      setSetupData(null);
      setVerifyToken('');
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Invalid code');
    }
  };

  const disable = async () => {
    try {
      await disableMutation.mutateAsync();
      toast.success('Two-factor authentication disabled');
      setShowDisable(false);
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Cannot disable');
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-v-charcoal">Two-Factor Authentication</h1>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-v-charcoal">TOTP Authenticator</h2>
            <p className="text-sm text-gray-500">
              Use an authenticator app (e.g. Google Authenticator, Authy) to generate time-based codes.
            </p>
          </div>
          <Badge variant={status?.enabled ? 'green' : status?.required ? 'red' : 'gray'}>
            {status?.enabled ? 'Enabled' : status?.required ? 'Required' : 'Disabled'}
          </Badge>
        </div>

        {status?.required && !status?.enabled && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3 text-sm text-yellow-800">
            Two-factor authentication is mandatory for your role. Please set it up to continue using the platform.
          </div>
        )}

        {!status?.enabled && !setupData && (
          <Button onClick={beginSetup} loading={setupMutation.isPending}>Set Up 2FA</Button>
        )}

        {status?.enabled && (
          <Button variant="danger" onClick={() => setShowDisable(true)}>Disable 2FA</Button>
        )}
      </Card>

      {/* Setup flow */}
      {setupData && (
        <Card className="p-6 space-y-5">
          <h2 className="text-lg font-bold text-v-charcoal">Set Up Your Authenticator</h2>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              1. Open your authenticator app and scan the QR code, or enter the secret key manually.
            </p>
            <div className="flex flex-col items-center gap-4 p-4 bg-gray-50 rounded-xl">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(setupData.otpauthUrl)}`}
                alt="2FA QR Code"
                className="w-48 h-48 rounded-lg"
              />
              <div className="text-center">
                <div className="text-xs text-gray-500 uppercase tracking-wide">Secret Key</div>
                <code className="text-sm font-mono text-v-charcoal select-all">{setupData.secret}</code>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              2. Save these backup codes somewhere safe. Each can be used once if you lose access to your authenticator.
            </p>
            <div className="grid grid-cols-4 gap-2 p-4 bg-gray-50 rounded-xl">
              {setupData.backupCodes.map((code, i) => (
                <code key={i} className="text-sm font-mono text-center text-v-charcoal">{code}</code>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              3. Enter the 6-digit code from your authenticator to confirm setup.
            </p>
            <div className="flex gap-3">
              <Input
                value={verifyToken}
                onChange={e => setVerifyToken(e.target.value)}
                placeholder="123456"
                maxLength={8}
                className="max-w-[200px] text-center font-mono text-lg tracking-widest"
              />
              <Button onClick={verify} loading={verifyMutation.isPending} disabled={verifyToken.length < 6}>
                Verify &amp; Enable
              </Button>
            </div>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={showDisable}
        title="Disable Two-Factor Authentication"
        description="Are you sure? This will remove 2FA protection from your account."
        onConfirm={disable}
        onCancel={() => setShowDisable(false)}
      />
    </div>
  );
}
