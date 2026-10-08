import { redirect } from "next/navigation";

// Reports are the only page the online site serves today.
export default function Page() {
  redirect("/reports");
}