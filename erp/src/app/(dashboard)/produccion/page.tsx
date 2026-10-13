import { redirect } from "next/navigation";

export default function ProductionHome() {
  redirect("/produccion/ordenes");
}
