import { useCarbon } from "@carbon/auth";
import {
  getCompanyPrivateBucket,
  safeStorageFileName,
  storage
} from "@carbon/files";
import { isHeic, MediaUploader } from "@carbon/files/media";
import { Button, cn, toast } from "@carbon/react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useRef, useState } from "react";
import { LuImagePlus, LuPlay } from "react-icons/lu";
import { useUser } from "~/hooks";
import { path } from "~/utils/path";
import type { ShopDispatchFile } from "../shop.types";

type ShopDispatchMediaProps = {
  dispatchId: string;
  files: ShopDispatchFile[];
  /** When true, hide the upload control (read-only gallery). */
  readOnly?: boolean;
  onUploaded?: () => void;
};

function isVideoName(name: string) {
  return /\.(mp4|mov|webm|m4v|avi)$/i.test(name);
}

/**
 * Gallery + capture upload for `${companyId}/maintenance/${dispatchId}/…`
 * (same path as ERP MaintenanceDispatchFiles).
 */
export function ShopDispatchMedia({
  dispatchId,
  files,
  readOnly = false,
  onUploaded
}: ShopDispatchMediaProps) {
  const { t } = useLingui();
  const { carbon } = useCarbon();
  const { company } = useUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const uploadFiles = useCallback(
    async (selected: FileList | File[]) => {
      if (!carbon) {
        toast.error(t`Carbon client not available`);
        return;
      }
      const list = Array.from(selected);
      if (list.length === 0) return;

      setUploading(true);
      try {
        const uploader = new MediaUploader(carbon, {
          bucket: getCompanyPrivateBucket(company.id),
          directory: `${company.id}/tmp`
        });
        let prepared = list;
        if (list.some((file) => isHeic(file.name, file.type))) {
          prepared = await uploader.prepareForUpload(list);
        }

        for (const file of prepared) {
          const safeName = safeStorageFileName(file.name);
          if (!safeName) {
            toast.error(t`Invalid file name`);
            continue;
          }
          const filePath = `${company.id}/maintenance/${dispatchId}/${safeName}`;
          const result = await storage(carbon)
            .company(company.id)
            .upload(filePath, file, { upsert: true });
          if (result.error) {
            toast.error(t`Failed to upload ${file.name}`);
            continue;
          }
          toast.success(t`${file.name} uploaded`);
        }
        onUploaded?.();
      } catch {
        toast.error(t`Failed to upload media`);
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [carbon, company.id, dispatchId, onUploaded, t]
  );

  return (
    <div className="flex flex-col gap-2">
      {files.length > 0 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {files.map((file) => {
            const preview = path.to.file.previewFile(`private/${file.path}`);
            const video = isVideoName(file.name);
            return (
              <li key={file.path} className="shrink-0">
                <a
                  href={preview}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "relative block h-20 w-20 overflow-hidden rounded-md border border-border bg-muted"
                  )}
                >
                  {video ? (
                    <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
                      <LuPlay className="h-5 w-5" />
                      <span className="max-w-full truncate px-1 text-[10px]">
                        {file.name}
                      </span>
                    </span>
                  ) : (
                    <img
                      src={preview}
                      alt={file.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          <Trans>No photos or videos yet</Trans>
        </p>
      )}

      {!readOnly ? (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void uploadFiles(e.target.files);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            isDisabled={uploading}
            leftIcon={<LuImagePlus />}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Trans>Uploading…</Trans>
            ) : (
              <Trans>Add photo / video</Trans>
            )}
          </Button>
        </>
      ) : null}
    </div>
  );
}
