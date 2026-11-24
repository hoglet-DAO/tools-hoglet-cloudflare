import { VerifyPage } from "@/components/verify/VerifyPage";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const { address } = await searchParams;
  return <VerifyPage initialAddress={address ?? ""} />;
}
