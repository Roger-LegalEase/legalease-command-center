import { buildFileView } from "./file-view.mjs";

const clean = (value = "") => String(value ?? "").trim();
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export const FILE_DETAIL_TABS = freeze(["Preview", "Details", "Activity", "Sharing", "Related"]);

function contentHref(file) {
  return `/api/ui/files/${encodeURIComponent(file.sourceKind)}/${encodeURIComponent(file.sourceId)}/content`;
}

function preview(file) {
  const key = file.fileType?.key || "unknown";
  const publicUrl = file.storageRef?.publicUrl || null;
  if (key === "link") return { kind:"link", available:Boolean(publicUrl), href:publicUrl, message:publicUrl ? "Open the reviewed source link." : "Link preview unavailable." };
  if (["image", "pdf", "text", "markdown"].includes(key)) return {
    kind:key,
    available:Boolean(publicUrl || file.storageRef?.reference),
    href:publicUrl || (file.storageRef?.reference ? contentHref(file) : null),
    message:publicUrl || file.storageRef?.reference ? null : "Preview unavailable. File metadata is still available."
  };
  return { kind:"unsupported", available:false, href:null, message:"Preview is unavailable for this file type. Details and authorized open or download actions remain available." };
}

export function buildFileDetails(state = {}, stableKey = "", actor = {}) {
  const file = buildFileView(state, clean(stableKey), actor);
  if (!file) return null;
  return freeze({
    ok:true,
    file:{
      id:file.id,
      name:file.name,
      href:file.href,
      fileType:file.fileType,
      status:file.status,
      owner:file.owner,
      modifiedAt:file.modifiedAt,
      verifiedAt:file.verifiedAt,
      sourceRef:file.sourceRef,
      storage:{ kind:file.storageRef?.kind || "metadata-only", available:Boolean(file.storageRef?.reference || file.storageRef?.publicUrl) },
      permissions:file.permissions
    },
    tabs:FILE_DETAIL_TABS,
    preview:preview(file),
    activity:file.activity,
    related:file.relatedObjects.filter((item) => item.href),
    sharing:{
      visibility:file.permissions?.visibility || "unavailable",
      allowedRoles:file.permissions?.allowedRoles || [],
      ownerOnly:file.permissions?.ownerOnly === true,
      sensitive:file.permissions?.sensitive === true,
      public:false
    },
    actions:{
      canOpen:Boolean(file.storageRef?.publicUrl || file.storageRef?.reference),
      openHref:file.storageRef?.publicUrl || (file.storageRef?.reference ? contentHref(file) : null),
      canDownload:Boolean(file.storageRef?.reference),
      downloadHref:file.storageRef?.reference ? `${contentHref(file)}?download=1` : null
    }
  });
}
