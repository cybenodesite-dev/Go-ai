import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const cairo = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "بوابة المزودين — AI Provider Gateway",
  description:
    "أداة إدارة مزودين الذكاء الاصطناعي: مفاتيح API، جلب واختيار الموديلات، رابط بيز موحد مع تدوير تلقائي للمفاتيح وعدّاد استخدام.",
  icons: {
    icon: "https://ai-service-provider.vercel.app/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${cairo.variable} font-cairo antialiased bg-background text-foreground`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
