import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { scheduleToComposerDraft } from "@shared/blocking";
import type { Blocklist, BlockingSchedule, DeviceListEntry } from "@shared/types";
import { X } from "lucide-react";
import { Button, IconButton } from "../ui";
import { emptyBlockScreenDraft, type BlockScreenDraft } from "./BlockScreenEditor";
import { SessionComposer } from "./SessionComposer";

export function SessionEditDialog({
  schedule,
  blocklists,
  devices,
  loading = false,
  onClose,
}: {
  schedule: BlockingSchedule;
  blocklists: Blocklist[];
  devices: Array<DeviceListEntry & { deviceID: string }>;
  loading?: boolean;
  onClose: () => void;
}) {
  const [blockScreen, setBlockScreen] = useState<BlockScreenDraft>(emptyBlockScreenDraft);
  useEffect(() => {
    const load = window.stopscrolling.getBlockScreens;
    if (!load) return;
    let cancel = false;
    void load().then((screens) => {
      if (cancel) return;
      const row = screens.sessions[schedule.schedule_id];
      setBlockScreen(row
        ? { header: row.header, detail: row.detail, imageFile: row.imageFile, imageUrl: row.imageUrl }
        : emptyBlockScreenDraft());
    }).catch(() => {});
    return () => {
      cancel = true;
    };
  }, [schedule.schedule_id]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="blocking-dialog-scrim blocking-dialog-scrim-front" onClick={onClose}>
      <div
        className="blocking-dialog blocking-dialog-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-edit-title"
        onClick={(event) => event.stopPropagation()}
      >
        <IconButton
          className="blocking-dialog-close"
          label="Close session editor"
          icon={X}
          onClick={onClose}
        />
        <div className="inspector-kicker">Edit session</div>
        <h2 id="session-edit-title">{schedule.name}</h2>
        <SessionComposer
          key={`${schedule.schedule_id}-${schedule.updated_at}`}
          initialDraft={scheduleToComposerDraft(schedule)}
          blocklists={blocklists}
          devices={devices}
          extraBlocklists={schedule.blocklists}
          extraDevices={schedule.devices}
          submitLabel="Save session"
          loading={loading}
          initialScreen={blockScreen}
          onCancel={onClose}
          onSubmit={(payload, screen) => {
            window.stopscrolling.updateBlockingSchedule({
              schedule_id: schedule.schedule_id,
              ...payload,
              is_active: schedule.is_active,
            });
            void window.stopscrolling.saveSessionBlockScreen?.({
              scheduleId: schedule.schedule_id,
              header: screen.header,
              detail: screen.detail,
              imageFile: screen.imageFile,
            });
            onClose();
          }}
          extraActions={(
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => {
                window.stopscrolling.deleteBlockingSchedule(schedule.schedule_id);
                onClose();
              }}
            >
              Delete session
            </Button>
          )}
        />
      </div>
    </div>,
    document.body,
  );
}
