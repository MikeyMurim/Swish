'use client';

import { useState } from 'react';
import Icon from './Icon';
import { type Court } from './courts';

interface CheckInModalProps {
  court: Court;
  onClose: () => void;
  onConfirm: (status: string) => Promise<void>;
}

export default function CheckInModal({ court, onClose, onConfirm }: CheckInModalProps) {
  const [status, setStatus] = useState<'live' | 'full'>('live');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async () => {
    setIsProcessing(true);
    await onConfirm(status);
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-container rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-surface-variant/50 flex flex-col">
        
        {/* Header */}
        <div className="p-6 border-b border-surface-variant/30 flex justify-between items-start">
          <div>
            <h2 className="font-headline text-headline-sm text-on-surface uppercase leading-none">
              Report Status
            </h2>
            <p className="font-body text-label-md text-secondary mt-2">
              Updating <span className="text-primary font-bold">{court.name}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-secondary hover:text-on-surface transition-colors">
            <Icon name="close" />
          </button>
        </div>

        {/* Body - Status Selection */}
        <div className="p-6 flex flex-col gap-4">
          <button
            onClick={() => setStatus('live')}
            className={`font-body text-label-md py-4 rounded-xl uppercase font-black transition-all flex items-center justify-center gap-2 ${
              status === 'live'
                ? 'bg-primary-container text-on-primary-container border-2 border-primary ring-2 ring-primary/20'
                : 'bg-surface-container-high text-on-surface border-2 border-transparent hover:bg-surface-variant'
            }`}
          >
            <Icon name="local_fire_department" className={status === 'live' ? 'text-primary' : 'text-secondary'} />
            Active / Live
          </button>

          <button
            onClick={() => setStatus('full')}
            className={`font-body text-label-md py-4 rounded-xl uppercase font-black transition-all flex items-center justify-center gap-2 ${
              status === 'full'
                ? 'bg-error/10 text-error border-2 border-error ring-2 ring-error/20'
                : 'bg-surface-container-high text-on-surface border-2 border-transparent hover:bg-surface-variant'
            }`}
          >
            <Icon name="group_off" className={status === 'full' ? 'text-error' : 'text-secondary'} />
            Full / No Space
          </button>
        </div>

        {/* Footer Actions */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="flex-1 font-body text-label-md py-3 rounded-lg uppercase font-bold text-secondary hover:bg-surface-variant transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isProcessing}
            className="flex-1 font-body text-label-md py-3 rounded-lg uppercase font-black bg-primary-container text-on-primary-container hover:brightness-110 disabled:opacity-60 transition-all flex justify-center items-center gap-2"
          >
            {isProcessing ? (
              <Icon name="sync" className="animate-spin" />
            ) : (
              'Confirm'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}