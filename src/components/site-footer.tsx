import React from "react";
import { CuLaunchBrand } from "./cu-launch-brand";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <CuLaunchBrand showTagline surface="dark" />
        <span>© {year} Cedarville University. All rights reserved.</span>
      </div>
    </footer>
  );
}
