import type { getDatabase } from "@/../db";
import type { ResumeRow } from "@/lib/db-mappers";

type Database = ReturnType<typeof getDatabase>;

export interface ResumeRevisionWrite {
  id: string;
  userId: string;
  expectedRevision: number;
  title: string;
  track: ResumeRow["track"];
  targetProfileId: string | null;
  targetName: string;
  templateId: string;
  status: ResumeRow["status"];
  progress: number;
  contentJson: string;
  deletedAt: string | null;
  now: string;
}

export async function writeResumeRevision(db: Database, write: ResumeRevisionWrite) {
  const nextRevision = write.expectedRevision + 1;
  const results = await db.batch<ResumeRow>([
    db.prepare(`UPDATE resumes SET
        title = ?, track = ?, target_profile_id = ?, target_name = ?, template_id = ?, status = ?,
        progress = ?, revision = ?, content_json = ?, updated_at = ?, deleted_at = ?
      WHERE id = ? AND user_id = ? AND revision = ?
      RETURNING *`)
      .bind(
        write.title,
        write.track,
        write.targetProfileId,
        write.targetName,
        write.templateId,
        write.status,
        write.progress,
        nextRevision,
        write.contentJson,
        write.now,
        write.deletedAt,
        write.id,
        write.userId,
        write.expectedRevision,
      ),
    db.prepare(`INSERT INTO resume_versions (id, resume_id, revision, content_json, created_at)
      SELECT ?, id, revision, content_json, ? FROM resumes
      WHERE id = ? AND user_id = ? AND revision = ?`)
      .bind(crypto.randomUUID(), write.now, write.id, write.userId, nextRevision),
  ]);
  const updated = results[0]?.results[0];
  if (!updated) return null;
  if (Number(results[1]?.meta.changes ?? 0) !== 1) {
    throw new Error("Resume revision snapshot was not written");
  }
  return updated;
}
