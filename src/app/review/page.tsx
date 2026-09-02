import { redirect } from "next/navigation";

export default function ReviewRedirect() {
  redirect("/activity?view=review");
}
