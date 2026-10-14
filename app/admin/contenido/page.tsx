import { redirect } from "next/navigation";
import { paths } from "@/components/admin/routes";

export default function SiteContentIndex() {
  redirect(paths.contenido("portada"));
}
