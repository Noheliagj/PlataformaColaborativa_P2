import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addEdge,
  Background,
  Controls,
  reconnectEdge,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import type { Connection, Edge, Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Socket } from 'socket.io-client';
import { AlertCircle, Check } from 'lucide-react';
import axios from 'axios';
import { ClassNode, type ClassNodeData } from '../components/ClassNode';
import { generateId } from '../services/id';
import { CustomEdge, type ClassEdgeData } from '../components/CustomEdge';
import { Sidebar } from '../components/Sidebar';
import { EditorHeader } from '../components/EditorHeader';
import { EditorToolsPanel } from '../components/EditorToolsPanel';
import { HistoryPanel } from '../components/HistoryPanel';
import { ChatIA } from '../components/ChatIA';
import { TeamChatPanel } from '../components/TeamChatPanel';
import { AiWorkspacePanel } from '../components/AiWorkspacePanel';
import { useTheme } from '../lib/useTheme';
import {
  downloadSpringBootProject,
  getProject,
  getProjectMessages,
  saveProjectModel,
  type ProjectChatMessage,
  type ProjectRole,
} from '../services/projects';
import { importDiagramFromImage, sendAiMessage } from '../services/ai';
import { downloadDiagramAsPng } from '../lib/exportDiagramImage';
import { exportProjectXmi, importProjectXmi } from '../services/xmi';
import { clearSession, getStoredUser } from '../services/auth';
import { getErrorMessage } from '../services/http-error';
import { ensurePushSubscription } from '../services/push';
import {
  connectDiagramSocket,
  type AiChatResponsePayload,
  type ChatMessagePayload,
  type DiagramUpdatePayload,
  type NotificationPayload,
  type PresenceUpdatePayload,
  type PresenceUser,
} from '../services/socket';

type ClassFlowNode = Node<ClassNodeData>;

// Fuera del componente para no recrear los objetos en cada render.
const nodeTypes = { classNode: ClassNode };
const edgeTypes = { customEdge: CustomEdge };

type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | null;

function createClassNode(
  overrides?: Partial<ClassFlowNode['data']> & { position?: { x: number; y: number } },
): ClassFlowNode {
  return {
    id: generateId(),
    type: 'classNode',
    position:
      overrides?.position ??
      { x: 120 + Math.random() * 260, y: 100 + Math.random() * 220 },
    data: {
      name: 'NuevaClase',
      attributes: [],
      methods: [],
      isAssociative: false,
      ...overrides,
    },
  };
}

/** RF7: cardinalidades que cuentan como "muchos" (mismo criterio que el
 * generador Spring Boot en generator.service.ts -> isManyCardinality). */
function isManyValue(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toUpperCase();
  return normalized === 'N' || normalized === '*' || normalized.endsWith('..*') || normalized.endsWith('..N');
}

/**
 * Calcula dinámicamente los mejores puntos de anclaje (handles) entre dos
 * nodos según sus posiciones relativas en el lienzo, evitando enrutamientos
 * extraños en forma de árbol o cruces innecesarios.
 */
export function getSmartHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      sourceHandle: dx >= 0 ? 'right-source' : 'left-source',
      targetHandle: dx >= 0 ? 'left-target' : 'right-target',
    };
  } else {
    return {
      sourceHandle: dy >= 0 ? 'bottom-source' : 'top-source',
      targetHandle: dy >= 0 ? 'top-target' : 'bottom-target',
    };
  }
}

/** RF5/RF6 - Lienzo de modelado de clases: edición + persistencia. */
export function EditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [nodes, setNodes, onNodesChange] = useNodesState<ClassFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selection, setSelection] = useState<Selection>(null);

  const [projectName, setProjectName] = useState('');
  const [role, setRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportingImage, setExportingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // RF18/Vision/XMI: estados de carga de las importaciones/exportaciones
  // adicionales del editor (no bloquean el guardado normal del diagrama).
  const [importingImage, setImportingImage] = useState(false);
  const [importingXmi, setImportingXmi] = useState(false);
  const [exportingXmi, setExportingXmi] = useState(false);

  // Selector de tema claro/oscuro (oscuro por defecto, ver lib/theme.ts).
  const [theme, toggleTheme] = useTheme();

  // RF10: colaboración en tiempo real vía WebSocket.
  const socketRef = useRef<Socket | null>(null);
  // true justo después de aplicar un cambio remoto: evita reenviarlo como
  // si fuera un cambio local (y así entrar en un eco infinito).
  const applyingRemoteRef = useRef(false);
  // true una vez que el diagrama inicial ya se cargó desde el backend:
  // evita emitir un "cambio" espurio en el primer render.
  const loadedRef = useRef(false);
  const [remoteEditor, setRemoteEditor] = useState<string | null>(null);
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [socketConnected, setSocketConnected] = useState(false);

  // Chat en tiempo real entre colaboradores conectados al proyecto.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ProjectChatMessage[]>([]);
  const currentUserId = getStoredUser()?.id ?? null;

  // RF9: historial de guardados del diagrama.
  const [historyOpen, setHistoryOpen] = useState(false);

  // RF11: asistente de IA.
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Modo IA: vista dividida dedicada para interacción asistida con Claude
  const [aiMode, setAiMode] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);

  // Panel lateral de herramientas (modelado, XMI, Vision, tema): colapsado
  // por defecto para dejarle todo el espacio posible al lienzo.
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const handleAuthError = useCallback(
    (err: unknown): boolean => {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        clearSession();
        navigate('/login');
        return true;
      }
      return false;
    },
    [navigate],
  );

  // Al entrar: carga el proyecto y su diagrama (si existe).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const project = await getProject(id);
        if (cancelled) return;
        setProjectName(project.name);
        setRole(project.role ?? 'OWNER');
        const model = project.modelData;
        if (model?.nodes?.length) {
          const loadedNodes = model.nodes as ClassFlowNode[];
          setNodes(loadedNodes);
          const nodeMap = new Map(loadedNodes.map((n) => [n.id, n]));
          // Fuerza 'customEdge' y asegura que las aristas tengan anclajes limpios
          setEdges(
            ((model.edges ?? []) as Edge[]).map((edge) => {
              const srcNode = nodeMap.get(edge.source);
              const tgtNode = nodeMap.get(edge.target);
              const smart =
                srcNode && tgtNode
                  ? getSmartHandles(srcNode.position, tgtNode.position)
                  : null;
              return {
                ...edge,
                sourceHandle: edge.sourceHandle || smart?.sourceHandle,
                targetHandle: edge.targetHandle || smart?.targetHandle,
                type: 'customEdge',
              };
            }),
          );
        }
      } catch (err) {
        if (!cancelled && !handleAuthError(err)) {
          setError(getErrorMessage(err, 'No se pudo cargar el proyecto'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          // A partir de aquí, cualquier cambio en nodes/edges es del usuario
          // (o remoto) y debe considerarse para el broadcast por WebSocket.
          loadedRef.current = true;
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, setNodes, setEdges, handleAuthError]);

  // Notificaciones push: solo tiene sentido pedirle permiso al dueño, que es
  // quien las recibe (ver NotificationsService.notifyOwner en el backend).
  useEffect(() => {
    if (role === 'OWNER') void ensurePushSubscription();
  }, [role]);

  // Historial reciente del chat del proyecto (los mensajes en vivo llegan
  // por el evento 'chat-message' del socket, ver el efecto de más abajo).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    getProjectMessages(id)
      .then((history) => {
        if (!cancelled) setChatMessages(history);
      })
      .catch(() => {
        // El chat no es crítico para poder seguir editando el diagrama: si
        // falla la carga del historial, se sigue pudiendo enviar y recibir
        // mensajes nuevos por WebSocket.
      });

    return () => {
      cancelled = true;
      setChatMessages([]);
    };
  }, [id]);

  // RF10: conecta al canal /diagram del proyecto y aplica en vivo los
  // cambios que emitan otros colaboradores.
  useEffect(() => {
    if (!id) return;
    loadedRef.current = false; // se reactiva cuando `load()` termine arriba

    const socket = connectDiagramSocket();
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      socket.emit('join-project', { projectId: id });
    });

    socket.on('disconnect', () => setSocketConnected(false));

    socket.on('connect_error', () => {
      setError(
        'No se pudo conectar la colaboración en tiempo real. Los cambios se siguen guardando, pero no verás las ediciones de otros en vivo.',
      );
    });

    socket.on('project-error', () => {
      setError('No se pudo unir a la colaboración en tiempo real de este proyecto.');
    });

    // RF10: quién tiene el proyecto abierto ahora mismo.
    socket.on('presence-update', (payload: PresenceUpdatePayload) => {
      setPresence(payload.users);
    });

    socket.on('diagram-update', (payload: DiagramUpdatePayload) => {
      applyingRemoteRef.current = true;
      setNodes(payload.nodes as ClassFlowNode[]);
      setEdges(
        (payload.edges as Edge[]).map((edge) => ({
          ...edge,
          type: 'customEdge',
        })),
      );
      setRemoteEditor(payload.fromUserName);
    });

    // Chat en tiempo real: cada mensaje ya persistido (propio, de otro
    // colaborador o de la IA) llega por este evento único.
    socket.on('chat-message', (payload: ChatMessagePayload) => {
      setAiProcessing(false);
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) return prev;
        return [
          ...prev,
          {
            id: payload.id,
            content: payload.content,
            createdAt: payload.createdAt,
            projectId: payload.projectId,
            user: payload.user || {
              id: payload.userId || 'anon',
              name: payload.userName || 'Usuario',
            },
            actions: payload.actions,
          },
        ];
      });
    });

    // Respuestas y eventos de la IA vía Socket.IO
    socket.on('ai-chat-response', (_payload: AiChatResponsePayload) => {
      setAiProcessing(false);
    });

    socket.on('ai-chat-error', (payload: { message?: string }) => {
      setAiProcessing(false);
      setError(payload.message || 'Error al comunicarse con el Asistente de IA');
    });

    // Notificación para el dueño (colaborador se unió / guardó cambios),
    // solo llega a este socket si está en su sala personal `user:{id}`
    // (ver DiagramGateway.handleConnection). Reusa el toast de éxito que ya
    // existe para 'notice'.
    socket.on('notification', (payload: NotificationPayload) => {
      setNotice(payload.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
      setPresence([]);
    };
  }, [id, setNodes, setEdges]);

  // RF10: retransmite los cambios locales (nodos/aristas/atributos/métodos)
  // al resto de colaboradores conectados a este proyecto, con un pequeño
  // "debounce" para no saturar el socket durante un arrastre.
  useEffect(() => {
    if (applyingRemoteRef.current) {
      // Este cambio vino del propio broadcast remoto: no reenviarlo.
      applyingRemoteRef.current = false;
      return;
    }
    if (!loadedRef.current || !id) return;

    const timer = setTimeout(() => {
      socketRef.current?.emit('diagram-change', { projectId: id, nodes, edges });
    }, 250);
    return () => clearTimeout(timer);
  }, [nodes, edges, id]);

  // Las nuevas asociaciones usan el tipo 'customEdge' con anclajes inteligentes.
  const onConnect = useCallback(
    (conn: Connection) => {
      const sourceNode = nodes.find((n) => n.id === conn.source);
      const targetNode = nodes.find((n) => n.id === conn.target);
      const smart =
        sourceNode && targetNode
          ? getSmartHandles(sourceNode.position, targetNode.position)
          : null;

      setEdges((eds) =>
        addEdge(
          {
            ...conn,
            sourceHandle: conn.sourceHandle || smart?.sourceHandle,
            targetHandle: conn.targetHandle || smart?.targetHandle,
            id: `edge-${generateId()}`,
            type: 'customEdge',
            data: {} as ClassEdgeData,
          },
          eds,
        ),
      );
    },
    [nodes, setEdges],
  );

  // RF6: permite arrastrar el extremo de una relación YA EXISTENTE hacia
  // otro lado/handle de la misma clase o hacia otra clase, sin tener que
  // borrarla y crearla de nuevo.
  const onReconnect = useCallback(
    (oldEdge: Edge, newConnection: Connection) =>
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds)),
    [setEdges],
  );

  const addClass = useCallback(() => {
    setNodes((nds) => [...nds, createClassNode()]);
  }, [setNodes]);

  // RF6: cambios del panel lateral sobre la CLASE seleccionada, en vivo.
  const updateSelectedNode = useCallback(
    (patch: Partial<ClassNodeData>) => {
      if (selection?.kind !== 'node') return;
      const targetId = selection.id;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === targetId
            ? { ...node, data: { ...node.data, ...patch } }
            : node,
        ),
      );
    },
    [selection, setNodes],
  );

  // RF7: convierte la relación N:M seleccionada en una clase asociativa UML.
  // 1. Las dos clases principales mantienen su relación directa con anclajes adecuados.
  // 2. La clase asociativa se coloca debajo y se conecta mediante una línea auxiliar punteada (estilo UML).
  const convertEdgeToAssociativeClass = useCallback(() => {
    if (selection?.kind !== 'edge') return;
    const targetId = selection.id;
    const edge = edges.find((e) => e.id === targetId);
    if (!edge) return;
    const sourceNode = nodes.find((n) => n.id === edge.source);
    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!sourceNode || !targetNode) return;

    const data = (edge.data ?? {}) as ClassEdgeData;
    const associativeName =
      `${sourceNode.data.name ?? 'ClaseA'}${targetNode.data.name ?? 'ClaseB'}`;

    // Posición centrada debajo de las clases principales
    const midX = (sourceNode.position.x + targetNode.position.x) / 2;
    const midY = Math.max(sourceNode.position.y, targetNode.position.y) + 160;

    const associativeNode = createClassNode({
      name: associativeName,
      isAssociative: true,
      position: { x: midX, y: midY },
    });

    // 1. Las dos clases principales mantienen su asociación directa
    const directHandles = getSmartHandles(sourceNode.position, targetNode.position);
    const updatedMainEdge: Edge = {
      ...edge,
      sourceHandle: edge.sourceHandle || directHandles.sourceHandle,
      targetHandle: edge.targetHandle || directHandles.targetHandle,
      data: {
        ...data,
        sourceCardinality: data.sourceCardinality || '0..*',
        targetCardinality: data.targetCardinality || '0..*',
      },
    };

    // 2. Línea auxiliar punteada (estilo UML) que nace del punto medio de la línea principal
    const auxEdge: Edge = {
      id: `edge-assoc-${generateId()}`,
      source: sourceNode.id,
      target: associativeNode.id,
      sourceHandle: 'bottom-source',
      targetHandle: 'top-target',
      type: 'customEdge',
      data: {
        relationType: 'ASSOCIATION',
        edgeStyle: 'STRAIGHT',
        isAuxiliary: true,
        mainEdgeId: updatedMainEdge.id,
        sourceCardinality: '',
        targetCardinality: '',
        relationName: '«asociación»',
      },
    };

    setNodes((nds) => [...nds, associativeNode]);
    setEdges((eds) => [
      ...eds.map((e) => (e.id === targetId ? updatedMainEdge : e)),
      auxEdge,
    ]);
    setSelection({ kind: 'node', id: associativeNode.id });
  }, [selection, edges, nodes, setNodes, setEdges]);

  // RF6: cambios del panel lateral sobre la ASOCIACIÓN seleccionada, en vivo.
  const updateSelectedEdge = useCallback(
    (patch: Partial<ClassEdgeData>) => {
      if (selection?.kind !== 'edge') return;
      const targetId = selection.id;
      const currentEdge = edges.find((e) => e.id === targetId);
      if (!currentEdge) return;

      const mergedData = { ...(currentEdge.data ?? {}), ...patch };
      const isManySource = isManyValue(mergedData.sourceCardinality);
      const isManyTarget = isManyValue(mergedData.targetCardinality);

      // Si ambos extremos son muchos a muchos (0..* a 0..*) y aún no tiene clase intermedia:
      const hasAux = edges.some(
        (e) =>
          (e.data as ClassEdgeData | undefined)?.isAuxiliary &&
          ((e.data as ClassEdgeData | undefined)?.mainEdgeId === targetId ||
            e.source === currentEdge.source ||
            e.source === currentEdge.target ||
            e.target === currentEdge.source ||
            e.target === currentEdge.target),
      );

      setEdges((eds) =>
        eds.map((edge) =>
          edge.id === targetId ? { ...edge, data: mergedData } : edge,
        ),
      );

      // Creación automática y limpia de clase asociativa para relaciones N:M
      if (isManySource && isManyTarget && !hasAux && !(currentEdge.data as ClassEdgeData | undefined)?.isAuxiliary) {
        setTimeout(() => {
          convertEdgeToAssociativeClass();
        }, 50);
      }
    },
    [selection, edges, convertEdgeToAssociativeClass, setEdges],
  );

  // RF7: botón "Invertir Dirección" del panel de propiedades — intercambia
  // origen/destino y las cardinalidades/roles correspondientes.
  const reverseSelectedEdge = useCallback(() => {
    if (selection?.kind !== 'edge') return;
    const targetId = selection.id;
    setEdges((eds) =>
      eds.map((edge) => {
        if (edge.id !== targetId) return edge;
        const data = (edge.data ?? {}) as ClassEdgeData;
        return {
          ...edge,
          source: edge.target,
          target: edge.source,
          sourceHandle: edge.targetHandle,
          targetHandle: edge.sourceHandle,
          data: {
            ...data,
            sourceCardinality: data.targetCardinality,
            targetCardinality: data.sourceCardinality,
            sourceRole: data.targetRole,
            targetRole: data.sourceRole,
          },
        };
      }),
    );
  }, [selection, setEdges]);

  // RF5: guarda el estado actual (solo lo esencial) en el backend.
  const handleSave = useCallback(async () => {
    if (!id) return;
    setSaving(true);
    setError(null);
    try {
      const cleanNodes = nodes.map(({ id: nId, type, position, data }) => ({
        id: nId,
        type,
        position,
        data,
      })) as Node[];
      const cleanEdges = edges.map(
        ({ id: eId, source, target, sourceHandle, targetHandle, type, data }) => ({
          id: eId,
          source,
          target,
          sourceHandle,
          targetHandle,
          type,
          data,
        }),
      ) as Edge[];
      await saveProjectModel(id, { nodes: cleanNodes, edges: cleanEdges });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(getErrorMessage(err, 'No se pudo guardar el diagrama'));
      }
    } finally {
      setSaving(false);
    }
  }, [id, nodes, edges, handleAuthError]);

  // RF7: descarga el backend Spring Boot generado a partir del diagrama.
  const handleExportSpring = useCallback(async () => {
    if (!id) return;
    setExporting(true);
    setError(null);
    try {
      await downloadSpringBootProject(id, projectName || 'proyecto');
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(
          getErrorMessage(err, 'No se pudo generar el backend Spring Boot'),
        );
      }
    } finally {
      setExporting(false);
    }
  }, [id, projectName, handleAuthError]);

  // Descarga el lienzo actual como imagen PNG (no pasa por el backend: se
  // captura directamente del DOM del editor, ver lib/exportDiagramImage).
  const handleExportImage = useCallback(async () => {
    setExportingImage(true);
    setError(null);
    try {
      await downloadDiagramAsPng(nodes, projectName || 'diagrama');
    } catch (err) {
      // No pasa por el backend (se captura del DOM), así que el mensaje útil
      // ("agrega al menos una clase…") viene del propio Error, no de axios.
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo generar la imagen del diagrama',
      );
    } finally {
      setExportingImage(false);
    }
  }, [nodes, projectName]);

  /**
   * Importación de diagramas por imagen (Vision): la IA interpreta la foto o
   * captura y reemplaza el diagrama del proyecto (persistido en el backend).
   * El cambio llega al lienzo por el mismo canal que el resto de RF11/RF10:
   * el WebSocket 'diagram-update' que emite el backend tras aplicar el
   * import, no la respuesta HTTP — así todos los colaboradores conectados
   * lo ven igual, incluido quien lo subió.
   */
  const handleImportImage = useCallback(
    async (file: File) => {
      if (!id) return;
      setImportingImage(true);
      setError(null);
      setNotice(null);
      try {
        const result = await importDiagramFromImage(id, file);
        setNotice(result.summary);
      } catch (err) {
        if (!handleAuthError(err)) {
          setError(
            getErrorMessage(err, 'No se pudo interpretar la imagen del diagrama'),
          );
        }
      } finally {
        setImportingImage(false);
      }
    },
    [id, handleAuthError],
  );

  // Chat en tiempo real: emite el mensaje por el socket; el mensaje solo se
  // agrega a la lista cuando vuelve confirmado por el evento 'chat-message'
  // (ver el listener de arriba), no de forma optimista.
  const handleSendChatMessage = useCallback(
    (content: string) => {
      if (!id) return;
      socketRef.current?.emit('send-message', { projectId: id, content });
    },
    [id],
  );

  // Modo IA: envía la instrucción a la IA (Claude) por WebSocket (evento ai-chat-message)
  const handleSendAiMessage = useCallback(
    (content: string) => {
      const trimmed = content.trim();
      if (!id || !trimmed || aiProcessing) return;

      setAiProcessing(true);
      if (socketRef.current?.connected) {
        socketRef.current.emit('ai-chat-message', {
          projectId: id,
          content: trimmed,
        });
      } else {
        // Fallback REST si Socket.io estuviera temporalmente desconectado
        sendAiMessage(id, trimmed, [])
          .then((res) => {
            setAiProcessing(false);
            setChatMessages((prev) => [
              ...prev,
              {
                id: `ai-${Date.now()}`,
                content: res.reply,
                createdAt: new Date().toISOString(),
                projectId: id,
                user: { id: 'ai-assistant', name: 'Asistente IA (Claude)' },
                actions: res.actions,
              },
            ]);
          })
          .catch((err) => {
            setAiProcessing(false);
            setError(getErrorMessage(err, 'No se pudo contactar al asistente de IA'));
          });
      }
    },
    [id, aiProcessing],
  );

  // RF12: descarga el diagrama actual como .xmi (XMI 2.1).
  const handleExportXmi = useCallback(async () => {
    if (!id) return;
    setExportingXmi(true);
    setError(null);
    try {
      await exportProjectXmi(id, projectName || 'proyecto');
    } catch (err) {
      if (!handleAuthError(err)) {
        setError(getErrorMessage(err, 'No se pudo exportar el diagrama a XMI'));
      }
    } finally {
      setExportingXmi(false);
    }
  }, [id, projectName, handleAuthError]);

  // RF13: importa un .xmi y reemplaza el diagrama (mismo mecanismo de
  // actualización en vivo que handleImportImage, ver comentario arriba).
  const handleImportXmi = useCallback(
    async (file: File) => {
      if (!id) return;
      setImportingXmi(true);
      setError(null);
      setNotice(null);
      try {
        const result = await importProjectXmi(id, file);
        if (result.modelData?.nodes?.length) {
          applyingRemoteRef.current = true;
          const loadedNodes = result.modelData.nodes as ClassFlowNode[];
          setNodes(loadedNodes);
          const nodeMap = new Map(loadedNodes.map((n) => [n.id, n]));
          setEdges(
            ((result.modelData.edges ?? []) as Edge[]).map((edge) => {
              const srcNode = nodeMap.get(edge.source);
              const tgtNode = nodeMap.get(edge.target);
              const smart =
                srcNode && tgtNode
                  ? getSmartHandles(srcNode.position, tgtNode.position)
                  : null;
              return {
                ...edge,
                sourceHandle: edge.sourceHandle || smart?.sourceHandle,
                targetHandle: edge.targetHandle || smart?.targetHandle,
                type: 'customEdge',
              };
            }),
          );
        }
        setNotice(
          `Se importaron ${result.importedClasses} clase(s) desde el archivo XMI.`,
        );
      } catch (err) {
        if (!handleAuthError(err)) {
          setError(getErrorMessage(err, 'No se pudo importar el archivo XMI'));
        }
      } finally {
        setImportingXmi(false);
      }
    },
    [id, handleAuthError, setNodes, setEdges],
  );

  // Oculta el aviso "X está editando…" a los pocos segundos.
  useEffect(() => {
    if (!remoteEditor) return;
    const timer = setTimeout(() => setRemoteEditor(null), 2500);
    return () => clearTimeout(timer);
  }, [remoteEditor]);

  // Oculta el aviso de éxito (import de imagen/XMI) a los pocos segundos.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const selectedNode =
    selection?.kind === 'node'
      ? (nodes.find((node) => node.id === selection.id) ?? null)
      : null;
  const selectedEdge =
    selection?.kind === 'edge'
      ? (edges.find((edge) => edge.id === selection.id) ?? null)
      : null;

  const statusMeta = loading
    ? { dot: 'bg-ink-faint', label: 'Cargando…', spin: true }
    : saving
      ? { dot: 'bg-ink-faint', label: 'Guardando…', spin: true }
      : savedAt
        ? { dot: 'bg-positive', label: `Guardado ${savedAt}`, spin: false }
        : { dot: 'bg-ink-faint', label: 'Sin cambios guardados', spin: false };

  return (
    <div className="fixed inset-0 flex flex-col bg-canvas">
      <EditorHeader
        projectName={projectName}
        role={role}
        statusMeta={statusMeta}
        remoteEditor={remoteEditor}
        presence={presence}
        saving={saving}
        aiMode={aiMode}
        onToggleAiMode={() => setAiMode((prev) => !prev)}
        onBack={() => navigate('/')}
        onSave={handleSave}
        onOpenHistory={() => setHistoryOpen(true)}
      />

      {id && (
        <HistoryPanel
          open={historyOpen}
          projectId={id}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {id && !aiMode && (
        <ChatIA
          open={assistantOpen}
          projectId={id}
          onClose={() => setAssistantOpen(false)}
        />
      )}

      <TeamChatPanel
        open={chatOpen && !aiMode}
        messages={chatMessages}
        currentUserId={currentUserId}
        connected={socketConnected}
        onSend={handleSendChatMessage}
        onClose={() => setChatOpen(false)}
      />

      {error && (
        <div className="animate-fade-rise absolute top-14 left-1/2 z-30 flex -translate-x-1/2 items-start gap-2 rounded-lg border border-critical/45 bg-critical-soft px-3 py-2.5 text-[13px] text-critical shadow-lg backdrop-blur-md">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="max-w-xs">{error}</span>
        </div>
      )}

      {!error && notice && (
        <div className="animate-fade-rise absolute top-14 left-1/2 z-30 flex -translate-x-1/2 items-start gap-2 rounded-lg border border-positive/40 bg-positive/10 px-3 py-2.5 text-[13px] text-positive shadow-lg backdrop-blur-md">
          <Check size={16} className="mt-0.5 shrink-0" />
          <span className="max-w-xs">{notice}</span>
        </div>
      )}

      <div className="relative flex flex-1 overflow-hidden">
        {/* Modo Manual: panel de herramientas tradicional a la izquierda */}
        {!aiMode && (
          <EditorToolsPanel
            expanded={toolsExpanded}
            onToggleExpanded={() => setToolsExpanded((prev) => !prev)}
            theme={theme}
            onToggleTheme={toggleTheme}
            exporting={exporting}
            exportingImage={exportingImage}
            importingImage={importingImage}
            importingXmi={importingXmi}
            exportingXmi={exportingXmi}
            assistantOpen={assistantOpen}
            chatOpen={chatOpen}
            onAddClass={addClass}
            onExportSpring={handleExportSpring}
            onToggleAssistant={() => setAiMode(true)}
            onToggleChat={() => setChatOpen((prev) => !prev)}
            onImportImage={handleImportImage}
            onExportImage={handleExportImage}
            onExportXmi={handleExportXmi}
            onImportXmi={handleImportXmi}
          />
        )}

        {/* Modo IA: Vista de Pantalla Dividida (Split-Screen Workspace - aprox. 30-40% del ancho) */}
        {aiMode && (
          <div className="w-[360px] md:w-[390px] lg:w-[440px] max-w-[45%] shrink-0 h-full z-20 flex flex-col transition-all duration-300">
            <AiWorkspacePanel
              projectId={id ?? ''}
              messages={chatMessages}
              currentUserId={currentUserId}
              connected={socketConnected}
              isProcessing={aiProcessing}
              onSendMessage={handleSendAiMessage}
              onClose={() => setAiMode(false)}
            />
          </div>
        )}

        {/* Lienzo */}
        <div className="relative flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            edgesReconnectable
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={{ type: 'customEdge' }}
            onNodeClick={(_, node) => setSelection({ kind: 'node', id: node.id })}
            onEdgeClick={(_, edge) => setSelection({ kind: 'edge', id: edge.id })}
            onPaneClick={() => setSelection(null)}
            colorMode={theme}
            fitView
            // RF6: radio de conexión más generoso -- al arrastrar una
            // relación ya no hace falta soltarla justo sobre el puntito del
            // handle, basta con soltarla cerca de cualquier parte de la
            // clase para que React Flow la conecte al handle más cercano.
            connectionRadius={40}
          >
            <Background
              color={theme === 'dark' ? '#1b1c20' : '#dcdce0'}
              gap={22}
              size={1}
            />
            <Controls />
          </ReactFlow>

          {selectedNode && (
            <Sidebar
              kind="node"
              data={selectedNode.data}
              onChange={updateSelectedNode}
              onClose={() => setSelection(null)}
            />
          )}

          {selectedEdge && (
            <Sidebar
              kind="edge"
              data={(selectedEdge.data ?? {}) as ClassEdgeData}
              onChange={updateSelectedEdge}
              onClose={() => setSelection(null)}
              onReverse={reverseSelectedEdge}
              onConvertToAssociative={convertEdgeToAssociativeClass}
              canConvertToAssociative={
                isManyValue((selectedEdge.data as ClassEdgeData | undefined)?.sourceCardinality) &&
                isManyValue((selectedEdge.data as ClassEdgeData | undefined)?.targetCardinality)
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
