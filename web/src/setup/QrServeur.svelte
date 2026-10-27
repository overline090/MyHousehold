<script lang="ts">
  import type { Pairing } from '../lib/api';

  let { appariement }: { appariement: Pairing } = $props();
</script>

<!-- Le QR code porte l'adresse, l'empreinte entière et le code : scanné,
     il suffit. L'adresse et l'empreinte écrites servent à qui saisit
     l'adresse à la main — l'app lui montre alors la même empreinte. -->
<div class="qr">
  <!-- SVG produit par ce serveur à partir de sa propre adresse : rien
       qui vienne d'un visiteur. -->
  {@html appariement.qrSvg}
</div>
<dl>
  <dt>Adresse</dt>
  <dd>{appariement.address}</dd>
  <dt>Empreinte</dt>
  <dd class="empreinte">{appariement.fingerprint}</dd>
</dl>

<style>
  .qr {
    width: 200px;
    max-width: 100%;
    background: #fff;
    border-radius: 12px;
    padding: 8px;
  }

  .qr :global(svg) {
    display: block;
    width: 100%;
    height: auto;
  }

  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    font-size: 13px;
  }

  dt {
    color: var(--gris);
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .empreinte {
    font-family: ui-monospace, monospace;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
</style>
