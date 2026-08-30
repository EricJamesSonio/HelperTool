"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";

export default function PaymentForm() {
  const [loading, setLoading] = useState(false);

  return (
    <form>
      <Button disabled={loading}>Pay now</Button>
    </form>
  );
}