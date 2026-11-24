import { VerifyPage } from "@/components/verify/VerifyPage";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ address?: string; package?: string }>;
}) {
  const { address, package: packageName } = await searchParams;
  return <VerifyPage initialAddress={address ?? ""} initialPackage={packageName ?? ""} />;
}
