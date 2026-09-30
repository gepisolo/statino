import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  clientsRepo,
  collabEntriesRepo,
  collabTasksRepo,
  collaboratorsRepo,
  contractsRepo,
  entriesRepo,
  projectsRepo,
  tasksRepo,
  type EntriesRepo,
  type TasksRepo,
} from '@/lib/db';
import { collaboratorCatalogs, type Catalogs } from '@/lib/collaborators';
import { useAuthStore } from '@/stores/auth';
import type { Collaborator } from '@/types/models';

// Lo "spazio" su cui Statino e Attività lavorano: i dati propri
// (users/{uid}) oppure quelli di un collaboratore (collaborators/{email}).
// Un collaboratore sta sempre nel proprio; l'admin sceglie dal selettore
// "Collaboratore". Non è persistito: a ogni avvio l'admin riparte dai
// propri dati, così non si ritrova per sbaglio nello statino di un altro.
export const useWorkspaceStore = defineStore('workspace', () => {
  const auth = useAuthStore();

  // Solo admin: l'elenco dei collaboratori e quello selezionato.
  const collaborators = ref<Collaborator[]>([]);
  const collaboratorsLoaded = ref(false);
  const selectedEmail = ref<string | null>(null);

  async function ensureCollaborators(): Promise<void> {
    if (!auth.isAdmin || collaboratorsLoaded.value) return;
    collaborators.value = await collaboratorsRepo.list();
    collaboratorsLoaded.value = true;
  }

  function select(email: string | null): void {
    selectedEmail.value = email;
  }

  const collaboratorEmail = computed<string | null>(() => {
    if (auth.isCollaborator) return auth.email;
    if (auth.isAdmin) return selectedEmail.value;
    return null;
  });

  const isCollaboratorScope = computed(() => collaboratorEmail.value !== null);
  // L'admin lo statino di un collaboratore lo guarda (ed esporta) soltanto:
  // le ore le scrive chi le ha fatte. Le regole Firestore dicono lo stesso.
  const statinoReadOnly = computed(() => auth.isAdmin && isCollaboratorScope.value);

  // La chiave da passare ai repository: email nello spazio di un
  // collaboratore, uid altrimenti. Cambia quando cambia lo spazio, ed è
  // ciò che le viste osservano per ricaricare.
  const key = computed(() => collaboratorEmail.value ?? auth.uid ?? '');
  const entries = computed<EntriesRepo>(() =>
    isCollaboratorScope.value ? collabEntriesRepo : entriesRepo,
  );
  const tasks = computed<TasksRepo>(() =>
    isCollaboratorScope.value ? collabTasksRepo : tasksRepo,
  );

  // Clienti, contratti e progetti dello spazio corrente. Per un
  // collaboratore sono le copie sulla sua scheda, rilette a ogni chiamata:
  // è così che una modifica dei permessi arriva senza rifare il login.
  async function loadCatalogs(): Promise<Catalogs> {
    const email = collaboratorEmail.value;
    if (email) {
      const card = await collaboratorsRepo.get(email);
      if (!card) throw new Error('Scheda del collaboratore non trovata');
      return collaboratorCatalogs(card);
    }
    const [clients, contracts, projects] = await Promise.all([
      clientsRepo.list(auth.uid!),
      contractsRepo.list(auth.uid!),
      projectsRepo.list(auth.uid!),
    ]);
    return { clients, contracts, projects };
  }

  return {
    collaborators,
    collaboratorsLoaded,
    selectedEmail,
    ensureCollaborators,
    select,
    collaboratorEmail,
    isCollaboratorScope,
    statinoReadOnly,
    key,
    entries,
    tasks,
    loadCatalogs,
  };
});
