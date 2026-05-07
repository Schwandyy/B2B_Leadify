import Link from "next/link";
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div>
      <div className="mb-6 text-center">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-900">
          ← Product2Lead AI
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Willkommen zurück</CardTitle>
          <CardSubtitle>Melden Sie sich in Ihrem Workspace an.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <LoginForm />
        </CardBody>
      </Card>
    </div>
  );
}
