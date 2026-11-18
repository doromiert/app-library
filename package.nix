{lib, stdenvNoCC, glib}:
stdenvNoCC.mkDerivation {
  pname = "gnome-shell-extension-app-library";
  version = "0.1.4";
  src = lib.cleanSource ./.;
  nativeBuildInputs = [glib];
  dontBuild = true;
  installPhase = ''
    runHook preInstall
    destination="$out/share/gnome-shell/extensions/app-library@neg-zero.com"
    mkdir -p "$destination/schemas"
    cp *.js metadata.json stylesheet.css "$destination/"
    cp schemas/*.gschema.xml "$destination/schemas/"
    glib-compile-schemas --strict "$destination/schemas"
    runHook postInstall
  '';
  passthru.extensionUuid = "app-library@neg-zero.com";
  meta = {
    description = "Paginated GNOME app library with persistent category animations";
    homepage = "https://github.com/doromiert/app-library";
    license = lib.licenses.gpl3Plus;
    platforms = lib.platforms.linux;
  };
}
