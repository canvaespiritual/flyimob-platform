export const CORRETOR_ACADEMY = {
  funnelKey: "corretor-academy",
  vslKey: "corretor-academy-v1",
  videoId: "6aa950430492aa379514a80b",
  pitchSecond: 2034,
  vturbScript: "https://scripts.converteai.net/ab0d5dbd-353e-4147-a5c6-52ab96121828/players/6aa950430492aa379514a80b/v4/player.js",
  productName: "Corretor Academy",
  productId: "C13699064X",
  offerId: "a2itt7gi",
  coupon: "PONTE",
  checkoutBase: "https://pay.hotmart.com/C13699064X?off=a2itt7gi",
} as const;

export function buildCorretorAcademyCheckoutUrl(discount = false): string {
  const url = new URL(CORRETOR_ACADEMY.checkoutBase);
  if (discount) url.searchParams.set("offDiscount", CORRETOR_ACADEMY.coupon);
  return url.toString();
}
