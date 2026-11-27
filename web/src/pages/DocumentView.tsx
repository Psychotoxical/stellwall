import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../api.ts";
import { Button, Dialog, Notice } from "../components/ui.tsx";
import { useMe } from "../session.ts";
import { de } from "../text/de.ts";
import { useMembers } from "../shopping-api.ts";
import { fileUrl, useCategories, useDocument } from "../documents-api.ts";
import { Header } from "./Home.tsx";
import { DocumentForm, Validity, errorText } from "./Documents.tsx";

export function DocumentView() {
  const { id = "" } = useParams();
  const me = useMe().data!;
  const qc = useQueryClient();
  const nav = useNavigate();
  const members = useMembers().data ?? [];
  const categories = useCategories().data ?? [];
  const doc = useDocument(id);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = doc.data;

  if (doc.error) return <div className="shop"><Header sub={de.documents.page} title={de.documents.title} /><Notice>{errorText(doc.error)}</Notice></div>;
  if (!d) return null;
  const remove = async () => {
    try {
      await api(`/api/documents/${d.id}`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["documents"] });
      nav("/dokumente", { replace: true });
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="shop">
      <Header sub={[de.documents.page, d.category].filter(Boolean).join(" · ")} title={d.name} />
      <p className="docmeta">
        {d.pages ? de.documents.pages(d.pages) + " " : ""}
        <Validity d={d} />
      </p>
      {d.ocr === "pending" && <p className="docmeta">{de.documents.ocrPending}</p>}
      {d.ocr === "failed" && <p className="docmeta">{de.documents.ocrFailed}</p>}
      <div className="caltools">
        <a className="btn btn-primary btnlink" href={fileUrl(d.id, true)} download>{de.documents.download}</a>
        <Button variant="ghost" onClick={() => setEdit(true)}>{de.documents.edit}</Button>
        {d.createdBy === me.id && <Button variant="danger" onClick={() => setConfirm(true)}>{de.documents.delete}</Button>}
      </div>
      {error && <Notice>{error}</Notice>}
      <div className="docpreview">
        {d.mime === "application/pdf" ? (
          <iframe src={fileUrl(d.id)} title={d.name} />
        ) : d.mime.startsWith("image/") ? (
          <img src={fileUrl(d.id)} alt={d.name} />
        ) : (
          <p className="empty">{de.documents.noPreview}</p>
        )}
      </div>
      {edit && (
        <DocumentForm
          doc={d} members={members} me={me} categories={categories} onClose={() => setEdit(false)}
          onDone={async () => { await qc.invalidateQueries({ queryKey: ["documents"] }); setEdit(false); }}
        />
      )}
      <Dialog open={confirm} title={de.documents.deleteConfirm(d.name)} onClose={() => setConfirm(false)}>
        <div className="actions">
          <Button variant="ghost" onClick={() => setConfirm(false)}>{de.members.cancel}</Button>
          <Button variant="danger" onClick={remove}>{de.documents.delete}</Button>
        </div>
      </Dialog>
    </div>
  );
}
