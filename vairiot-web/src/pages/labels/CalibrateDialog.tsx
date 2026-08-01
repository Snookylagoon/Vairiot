import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/Button';

const QUEUE_STORAGE_KEY = 'vairiot.printerQueue';

interface CalibrateDialogProps {
  open: boolean;
  widthMm: number;
  heightMm: number;
  onClose: () => void;
}

/**
 * Guided printer calibration for roll (thermal) printing.
 *
 * Browsers can't send raw printer commands, so this walks the user through
 * running the calibration command in Terminal (one-click copy), then verifies
 * registration — one FEED press must stop a label edge exactly at the tear
 * line — before they go back to printing.
 */
export function CalibrateDialog({ open, widthMm, heightMm, onClose }: CalibrateDialogProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [showFallback, setShowFallback] = useState(false);
  const [queue, setQueue] = useState(() => localStorage.getItem(QUEUE_STORAGE_KEY) ?? 'TSC_TE210');

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setShowFallback(false);
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const safeQueue = queue.trim() || 'TSC_TE210';
  // GAPDETECT with no gap hint: the printer measures label pitch AND gap width
  // itself — a wrong hint shifts registration by a constant few mm.
  const command = `printf 'SIZE ${widthMm} mm,${heightMm} mm\\r\\nGAPDETECT\\r\\n' | lp -d ${safeQueue} -o raw`;

  const copyCommand = async () => {
    localStorage.setItem(QUEUE_STORAGE_KEY, safeQueue);
    try {
      await navigator.clipboard.writeText(command);
      toast.success('Command copied — paste it into Terminal');
    } catch {
      toast.error('Copy failed — select the command text and copy it manually');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 p-6 space-y-4">
        <h3 className="text-lg font-bold text-v-charcoal">
          Calibrate printer — {widthMm} × {heightMm} mm labels
        </h3>

        {step === 1 && (
          <>
            <p className="text-sm text-gray-600">
              The printer must re-learn the label length and the gap between labels every
              time the roll changes. Make sure the correct roll is loaded and the lid is
              clicked shut, then run this in <strong>Terminal</strong> on the Mac connected
              to the printer:
            </p>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">Printer queue</label>
              <input
                value={queue}
                onChange={e => setQueue(e.target.value)}
                className="flex-1 text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-v-pink"
              />
            </div>
            <div className="flex items-start gap-2">
              <code className="flex-1 block text-[11px] leading-relaxed bg-gray-900 text-green-300 rounded-lg p-3 overflow-x-auto whitespace-pre">
                {command}
              </code>
              <Button size="sm" variant="secondary" onClick={copyCommand} title="Copy command">
                <Copy size={14} />
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              The printer will feed a few labels while it measures — that's normal.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={() => setStep(2)}>
                I've run it — verify
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <p className="text-sm text-gray-600">
              Now press <strong>FEED</strong> once on the printer. It must advance
              <strong> exactly one label</strong> and stop with the label edge at the
              tear line. Don't print until this checks out — a misregistered printer
              wastes the whole batch.
            </p>
            {showFallback && (
              <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 space-y-1">
                <p className="font-semibold">Not at the tear line? Run the printer's built-in calibration:</p>
                <ol className="list-decimal ml-4 space-y-0.5">
                  <li>Power the printer <strong>off</strong>.</li>
                  <li>Hold <strong>FEED</strong> and power back on, still holding.</li>
                  <li>Release during the <strong>first flashing-red</strong> LED phase.</li>
                  <li>It feeds several labels; then press FEED once and re-check the tear line.</li>
                </ol>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setShowFallback(true)}>
                It didn't stop at the tear line
              </Button>
              <Button variant="primary" size="sm" onClick={() => {
                toast.success('Printer calibrated — ready to print');
                onClose();
              }}>
                <Check size={14} className="mr-1" /> Label is at the tear line
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
