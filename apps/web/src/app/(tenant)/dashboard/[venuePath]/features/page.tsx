import { redirect } from "next/navigation";

type Props = { params: Promise<{ venuePath: string }> };

/** Plan features are shown on the subscription page (4 categories). */
export default async function FeaturesPage({ params }: Props) {
  const { venuePath } = await params;
  redirect(`/dashboard/${venuePath}/subscription`);
}
