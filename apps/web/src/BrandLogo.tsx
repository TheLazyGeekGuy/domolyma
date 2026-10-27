import logo from "../../../design/brand/domolyma-logo-ui.webp";

export default function BrandLogo() {
  return (
    <img
      className="brand-logo"
      src={logo}
      alt="Domolyma"
      width={720}
      height={240}
      decoding="async"
    />
  );
}
