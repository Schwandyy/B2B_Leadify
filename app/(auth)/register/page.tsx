import Link from "next/link";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div>
      <div className="mb-6 text-center">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← Product2Lead AI
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Workspace anlegen</CardTitle>
          <CardSubtitle>In wenigen Sekunden eingerichtet — Sie werden Admin.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <RegisterForm />
        </CardBody>
      </Card>
    </div>
  );
}
