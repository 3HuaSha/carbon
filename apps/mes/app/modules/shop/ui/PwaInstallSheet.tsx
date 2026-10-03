import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetContent,
  BottomSheetDescription,
  BottomSheetHeader,
  BottomSheetTitle,
  Button
} from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";

type PwaInstallSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isIos: boolean;
};

/**
 * Manual install steps when `beforeinstallprompt` is unavailable
 * (iOS Safari, desktop non-Chromium, or Chrome without an installable state).
 */
export function PwaInstallSheet({
  open,
  onOpenChange,
  isIos
}: PwaInstallSheetProps) {
  const { t } = useLingui();

  return (
    <BottomSheet open={open} onOpenChange={onOpenChange}>
      <BottomSheetContent className="mx-auto max-w-lg pb-[env(safe-area-inset-bottom)]">
        <BottomSheetHeader>
          <BottomSheetTitle className="text-base font-semibold text-foreground">
            <Trans>Add to Home Screen</Trans>
          </BottomSheetTitle>
          <BottomSheetDescription>
            {isIos
              ? t`iPhone and iPad never show a native Install button — use Safari’s Share menu.`
              : t`Chrome did not offer a one-tap install yet. Use the menu below, or stay on this page a few seconds and try Install again.`}
          </BottomSheetDescription>
        </BottomSheetHeader>
        <BottomSheetBody className="space-y-4">
          {isIos ? (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>
                <Trans>Open this page in Safari (not Chrome on iOS).</Trans>
              </li>
              <li>
                <Trans>Tap Share (square with an arrow).</Trans>
              </li>
              <li>
                <Trans>Tap Add to Home Screen, then Add.</Trans>
              </li>
            </ol>
          ) : (
            <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
              <li>
                <Trans>Use Chrome on Android (or desktop Chrome).</Trans>
              </li>
              <li>
                <Trans>Tap the menu (⋮) at the top right.</Trans>
              </li>
              <li>
                <Trans>Tap Install app or Add to Home screen.</Trans>
              </li>
            </ol>
          )}
          <p className="text-xs text-muted-foreground">
            {isIos
              ? t`Chrome, Firefox, and Edge on iOS cannot native-install this app.`
              : t`Firefox and Safari on desktop also use manual Add to Home Screen — only Chromium fires the Install prompt.`}
          </p>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() => onOpenChange(false)}
          >
            <Trans>Got it</Trans>
          </Button>
        </BottomSheetBody>
      </BottomSheetContent>
    </BottomSheet>
  );
}
