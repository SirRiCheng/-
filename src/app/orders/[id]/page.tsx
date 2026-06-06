import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ShipmentDetailResponse } from "@/lib/types";
import { OrderDetailView } from "@/components/order-detail-view";

async function getOrder(id: string) {
  const headerStore = headers();
  const host = headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (host ? `${protocol}://${host}` : "http://localhost:3000");

  try {
    const response = await fetch(`${baseUrl}/api/shipments/${id}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ShipmentDetailResponse;
  } catch {
    return null;
  }
}

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const detail = await getOrder(params.id);

  if (!detail) {
    notFound();
  }

  return <OrderDetailView detail={detail} />;
}
