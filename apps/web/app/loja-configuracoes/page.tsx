import { redirect } from 'next/navigation';
import { auth } from '../../auth';
import LojaConfiguracoesPage from './loja-configuracoes-client';
import { buildStorefrontStorageScope } from '../lib/storefront-settings';

export default async function LojaConfiguracoesPageRoute() {
  const session = await auth();
  if (!session) {
    redirect('/login');
  }

  const storageScope = buildStorefrontStorageScope(
    (session.user as { organizationId?: string } | undefined)?.organizationId,
    (session.user as { storeId?: string } | undefined)?.storeId
  );

  return <LojaConfiguracoesPage storageScope={storageScope} />;
}
