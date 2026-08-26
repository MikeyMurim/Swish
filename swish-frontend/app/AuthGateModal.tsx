"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "./Icon";

type AuthGateModalProps = {
  title: string;
  description: string;
  // Full-page gates (add-court, profile) want the browser "back" behaviour.
  // Overlay usages (e.g. the feed's join/check-in gate) pass their own
  // close handler instead, since there's no navigation to undo.
  onClose?: () => void;
};

export default function AuthGateModal({ title, description, onClose }: AuthGateModalProps) {
  const router = useRouter();
  const handleClose = onClose ?? (() => router.back());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-container-margin">
      <div className="relative w-full max-w-md bg-surface-container border-t-4 border-primary-container border border-surface-variant/50 rounded-xl shadow-2xl p-stack-lg flex flex-col gap-stack-lg">
        <button
          onClick={handleClose}
          aria-label="Close"
          className="absolute top-4 right-4 text-secondary hover:text-primary transition-colors"
        >
          <Icon name="close" className="text-2xl!" />
        </button>
        <div className="flex flex-col gap-stack-sm text-center pt-1">
          <h2 className="font-headline text-headline-lg uppercase text-on-surface">{title}</h2>
          <p className="font-body text-body-md text-secondary px-stack-sm">{description}</p>
        </div>
        <div className="flex flex-col gap-stack-md w-full">
          <Link
            href="/login"
            className="w-full text-center bg-primary-container text-on-primary-container font-body text-label-md py-3 rounded-lg uppercase tracking-wider font-black hover:brightness-110 transition-colors"
          >
            Sign In
          </Link>
          <Link
            href="/login?mode=sign-up"
            className="w-full text-center bg-transparent border-2 border-on-surface text-on-surface font-body text-label-md py-3 rounded-lg uppercase tracking-wider font-black hover:bg-on-surface hover:text-background transition-colors"
          >
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
