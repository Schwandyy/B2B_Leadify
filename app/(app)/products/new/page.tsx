import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from "@/components/ui/card";
import { NewProductForm } from "@/components/products/new-product-form";

export default function NewProductPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Neues Produkt</h1>
        <p className="text-sm text-slate-500">
          Beschreiben Sie Ihr Produkt — die KI extrahiert anschließend Branchen, Käuferrollen und Suchstrategie.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Stammdaten</CardTitle>
          <CardSubtitle>Angaben können später erweitert werden.</CardSubtitle>
        </CardHeader>
        <CardBody>
          <NewProductForm />
        </CardBody>
      </Card>
    </div>
  );
}
