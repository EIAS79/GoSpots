import { redirect } from "next/navigation";

type Props = { params: Promise<{ venuePath: string }> };

/** Operations hub removed — reservations is the daily floor view. */
export default async function OperationsPage({ params }: Props) {
  const { venuePath } = await params;
  redirect(`/dashboard/${venuePath}/sessions`);
}
