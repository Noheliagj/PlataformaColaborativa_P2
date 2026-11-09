import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

final FlutterLocalNotificationsPlugin _localNotifications = FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  debugPrint("[FCM Background] Notificación recibida: ${message.notification?.title} - ${message.notification?.body}");
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  try {
    await Firebase.initializeApp();
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Inicializar notificaciones locales para mostrar en barra superior
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await _localNotifications.initialize(initSettings);

    // Crear el canal de alta importancia en Android
    const androidChannel = AndroidNotificationChannel(
      'uml_studio_channel',
      'Notificaciones UML Studio',
      description: 'Canal para alertas de diagramas guardados e IA',
      importance: Importance.max,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(androidChannel);
  } catch (e) {
    debugPrint("Firebase init: $e");
  }

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const UmlViewerApp());
}

class UmlViewerApp extends StatefulWidget {
  const UmlViewerApp({super.key});

  @override
  State<UmlViewerApp> createState() => _UmlViewerAppState();
}

class _UmlViewerAppState extends State<UmlViewerApp> {
  // Configuración global del servidor
  String _serverIp = kIsWeb ? 'localhost' : '3.142.242.251';
  String _serverPort = '80';

  // Sesión de autenticación
  String? _jwtToken;
  String? _userName;
  String? _userEmail;

  @override
  void initState() {
    super.initState();
    _setupFcmForegroundListener();
  }

  void _setupFcmForegroundListener() {
    try {
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        final notif = message.notification;
        if (notif != null) {
          _localNotifications.show(
            notif.hashCode,
            notif.title ?? 'UML Studio',
            notif.body ?? 'Nueva actualización',
            const NotificationDetails(
              android: AndroidNotificationDetails(
                'uml_studio_channel',
                'Notificaciones UML Studio',
                channelDescription: 'Canal para alertas de diagramas guardados e IA',
                importance: Importance.max,
                priority: Priority.high,
                icon: '@mipmap/ic_launcher',
              ),
            ),
          );
        }
      });
    } catch (e) {
      debugPrint("FCM listener error: $e");
    }
  }

  Future<void> _registerFcmToken(String jwtToken) async {
    try {
      final messaging = FirebaseMessaging.instance;
      final settings = await messaging.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      if (settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional) {
        final fcmToken = await messaging.getToken();
        if (fcmToken != null) {
          debugPrint("[FCM] Token obtenido: $fcmToken");
          final url = Uri.parse('http://$_serverIp:$_serverPort/notifications/fcm-token');
          await http.post(
            url,
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer $jwtToken',
            },
            body: jsonEncode({'token': fcmToken}),
          );
          debugPrint("[FCM] Token registrado en el servidor AWS");
        }
      }
    } catch (e) {
      debugPrint("[FCM] Error al registrar token: $e");
    }
  }

  void _updateServerConfig(String ip, String port) {
    setState(() {
      _serverIp = ip;
      _serverPort = port;
    });
  }

  void _handleLoginSuccess({
    required String token,
    required String id,
    required String name,
    required String email,
  }) {
    setState(() {
      _jwtToken = token;
      _userName = name;
      _userEmail = email;
    });
    _registerFcmToken(token);
  }

  void _handleLogout() {
    setState(() {
      _jwtToken = null;
      _userName = null;
      _userEmail = null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Visor UML Móvil',
      debugShowCheckedModeBanner: false,
      themeMode: ThemeMode.dark,
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0B0F19),
        primaryColor: const Color(0xFF3B82F6),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF3B82F6),
          secondary: Color(0xFF8B5CF6),
          surface: Color(0xFF131B2E),
        ),
        fontFamily: 'Roboto',
      ),
      home: _jwtToken == null
          ? LoginScreen(
              serverIp: _serverIp,
              serverPort: _serverPort,
              onUpdateConfig: _updateServerConfig,
              onLoginSuccess: _handleLoginSuccess,
            )
          : ProjectsListScreen(
              serverIp: _serverIp,
              serverPort: _serverPort,
              token: _jwtToken!,
              userName: _userName ?? 'Usuario',
              userEmail: _userEmail ?? '',
              onLogout: _handleLogout,
            ),
    );
  }
}

// =============================================================
// MODELOS DE DATOS
// =============================================================

class ProjectItem {
  final String id;
  final String name;
  final String description;
  final String role;
  final DateTime updatedAt;

  ProjectItem({
    required this.id,
    required this.name,
    required this.description,
    required this.role,
    required this.updatedAt,
  });

  factory ProjectItem.fromMap(Map<String, dynamic> map) {
    DateTime dt;
    try {
      dt = DateTime.parse(map['updatedAt']?.toString() ?? '');
    } catch (_) {
      dt = DateTime.now();
    }
    return ProjectItem(
      id: map['id']?.toString() ?? '',
      name: map['name']?.toString() ?? 'Proyecto sin título',
      description: map['description']?.toString() ?? '',
      role: map['role']?.toString() ?? 'OWNER',
      updatedAt: dt,
    );
  }
}

class UmlAttribute {
  final String name;
  final String type;
  final String visibility;

  UmlAttribute({
    required this.name,
    required this.type,
    required this.visibility,
  });

  factory UmlAttribute.fromString(String raw) {
    String clean = raw.trim();
    String visibility = 'public';
    if (clean.startsWith('+')) {
      visibility = 'public';
      clean = clean.substring(1).trim();
    } else if (clean.startsWith('-')) {
      visibility = 'private';
      clean = clean.substring(1).trim();
    } else if (clean.startsWith('#')) {
      visibility = 'protected';
      clean = clean.substring(1).trim();
    } else if (clean.startsWith('~')) {
      visibility = 'package';
      clean = clean.substring(1).trim();
    }

    if (clean.contains(':')) {
      final idx = clean.indexOf(':');
      final n = clean.substring(0, idx).trim();
      final t = clean.substring(idx + 1).trim();
      return UmlAttribute(name: n, type: t.isEmpty ? 'String' : t, visibility: visibility);
    }
    return UmlAttribute(name: clean.isEmpty ? 'attr' : clean, type: 'String', visibility: visibility);
  }

  factory UmlAttribute.fromMap(Map<String, dynamic> map) {
    return UmlAttribute(
      name: map['name']?.toString() ?? 'atributo',
      type: map['type']?.toString() ?? 'String',
      visibility: map['visibility']?.toString() ?? 'public',
    );
  }

  factory UmlAttribute.fromDynamic(dynamic val) {
    if (val is Map<String, dynamic>) {
      return UmlAttribute.fromMap(val);
    } else if (val is String) {
      return UmlAttribute.fromString(val);
    }
    return UmlAttribute(name: val.toString(), type: 'String', visibility: 'public');
  }
}

class UmlMethod {
  final String name;
  final String returnType;
  final String visibility;
  final String paramsString;

  UmlMethod({
    required this.name,
    required this.returnType,
    required this.visibility,
    required this.paramsString,
  });

  factory UmlMethod.fromString(String raw) {
    String clean = raw.trim();
    String visibility = 'public';
    if (clean.startsWith('+')) {
      visibility = 'public';
      clean = clean.substring(1).trim();
    } else if (clean.startsWith('-')) {
      visibility = 'private';
      clean = clean.substring(1).trim();
    } else if (clean.startsWith('#')) {
      visibility = 'protected';
      clean = clean.substring(1).trim();
    } else if (clean.startsWith('~')) {
      visibility = 'package';
      clean = clean.substring(1).trim();
    }

    String returnType = 'void';
    String signature = clean;
    if (clean.contains(':')) {
      final lastColon = clean.lastIndexOf(':');
      returnType = clean.substring(lastColon + 1).trim();
      signature = clean.substring(0, lastColon).trim();
    }

    String name = signature;
    String params = '';
    if (signature.contains('(') && signature.contains(')')) {
      final openP = signature.indexOf('(');
      final closeP = signature.lastIndexOf(')');
      name = signature.substring(0, openP).trim();
      params = signature.substring(openP + 1, closeP).trim();
    }

    return UmlMethod(
      name: name.isEmpty ? 'metodo' : name,
      returnType: returnType.isEmpty ? 'void' : returnType,
      visibility: visibility,
      paramsString: params,
    );
  }

  factory UmlMethod.fromMap(Map<String, dynamic> map) {
    String pStr = '';
    if (map['parameters'] is List) {
      final pList = (map['parameters'] as List)
          .map((p) => p is Map ? "${p['name'] ?? 'arg'}: ${p['type'] ?? 'dynamic'}" : p.toString())
          .toList();
      pStr = pList.join(', ');
    } else if (map['parameters'] is String) {
      pStr = map['parameters'].toString();
    }
    return UmlMethod(
      name: map['name']?.toString() ?? 'metodo',
      returnType: map['returnType']?.toString() ?? 'void',
      visibility: map['visibility']?.toString() ?? 'public',
      paramsString: pStr,
    );
  }

  factory UmlMethod.fromDynamic(dynamic val) {
    if (val is Map<String, dynamic>) {
      return UmlMethod.fromMap(val);
    } else if (val is String) {
      return UmlMethod.fromString(val);
    }
    return UmlMethod(name: val.toString(), returnType: 'void', visibility: 'public', paramsString: '');
  }
}

class UmlClass {
  final String id;
  final String className;
  final bool isAssociative;
  final List<UmlAttribute> attributes;
  final List<UmlMethod> methods;
  final double positionX;
  final double positionY;

  UmlClass({
    required this.id,
    required this.className,
    required this.isAssociative,
    required this.attributes,
    required this.methods,
    this.positionX = 60.0,
    this.positionY = 60.0,
  });

  factory UmlClass.fromMap(Map<String, dynamic> map) {
    final id = map['id']?.toString() ?? '';
    final data = (map['data'] as Map<String, dynamic>?) ?? {};

    // Extraer el nombre real de la clase de cualquier propiedad posible
    final rawName = data['name'] ?? data['className'] ?? map['name'] ?? map['className'];
    final className = (rawName != null && rawName.toString().trim().isNotEmpty)
        ? rawName.toString().trim()
        : 'Clase';

    final isAssociative = data['isAssociative'] == true ||
        map['isAssociative'] == true ||
        className.toLowerCase().contains('association') ||
        className.toLowerCase().contains('asociacion') ||
        className.toLowerCase().contains('inscripcion');

    final pos = (map['position'] as Map<String, dynamic>?) ?? (data['position'] as Map<String, dynamic>?) ?? {};
    final posX = (pos['x'] as num?)?.toDouble() ??
        (map['positionX'] as num?)?.toDouble() ??
        (data['positionX'] as num?)?.toDouble() ??
        60.0;
    final posY = (pos['y'] as num?)?.toDouble() ??
        (map['positionY'] as num?)?.toDouble() ??
        (data['positionY'] as num?)?.toDouble() ??
        60.0;

    final List<UmlAttribute> attrs = [];
    final rawAttrs = data['attributes'] ?? map['attributes'];
    if (rawAttrs is List) {
      for (final a in rawAttrs) {
        attrs.add(UmlAttribute.fromDynamic(a));
      }
    }

    final List<UmlMethod> meths = [];
    final rawMeths = data['methods'] ?? map['methods'];
    if (rawMeths is List) {
      for (final m in rawMeths) {
        meths.add(UmlMethod.fromDynamic(m));
      }
    }

    return UmlClass(
      id: id,
      className: className,
      isAssociative: isAssociative,
      attributes: attrs,
      methods: meths,
      positionX: posX,
      positionY: posY,
    );
  }
}

class UmlEdge {
  final String id;
  final String source;
  final String target;
  final String relationName;
  final String sourceCard;
  final String targetCard;
  final String relationType;
  final bool isAuxiliary;
  final String? mainEdgeId;

  UmlEdge({
    required this.id,
    required this.source,
    required this.target,
    required this.relationName,
    required this.sourceCard,
    required this.targetCard,
    this.relationType = 'ASSOCIATION',
    this.isAuxiliary = false,
    this.mainEdgeId,
  });

  factory UmlEdge.fromMap(Map<String, dynamic> map) {
    final data = (map['data'] as Map<String, dynamic>?) ?? {};
    final isAux = data['isAuxiliary'] == true ||
        map['isAuxiliary'] == true ||
        map['type'] == 'associationClass' ||
        data['type'] == 'associationClass';
    final mainId = data['mainEdgeId']?.toString() ?? map['mainEdgeId']?.toString();
    return UmlEdge(
      id: map['id']?.toString() ?? '',
      source: map['source']?.toString() ?? '',
      target: map['target']?.toString() ?? '',
      relationName: data['relationName']?.toString() ??
          data['relationType']?.toString() ??
          'asociación',
      sourceCard: data['sourceCardinality']?.toString() ?? '',
      targetCard: data['targetCardinality']?.toString() ?? '',
      relationType: data['relationType']?.toString() ?? 'ASSOCIATION',
      isAuxiliary: isAux,
      mainEdgeId: mainId,
    );
  }
}

class ActivityEvent {
  final String time;
  final String title;
  final String subtitle;
  final bool isAi;

  ActivityEvent({
    required this.time,
    required this.title,
    required this.subtitle,
    this.isAi = false,
  });
}

enum ConnectionStatus { connected, connecting, disconnected, error }

// =============================================================
// PANTALLA 1: INICIO DE SESIÓN (LOGIN)
// =============================================================

class LoginScreen extends StatefulWidget {
  final String serverIp;
  final String serverPort;
  final Function(String ip, String port) onUpdateConfig;
  final Function({
    required String token,
    required String id,
    required String name,
    required String email,
  }) onLoginSuccess;

  const LoginScreen({
    super.key,
    required this.serverIp,
    required this.serverPort,
    required this.onUpdateConfig,
    required this.onLoginSuccess,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController();
  final _passwordCtrl = TextEditingController();
  bool _isLoading = false;
  bool _obscurePassword = true;
  String? _errorMessage;

  Future<void> _submitLogin() async {
    final email = _emailCtrl.text.trim().toLowerCase();
    final password = _passwordCtrl.text;

    if (email.isEmpty || password.isEmpty) {
      setState(() => _errorMessage = 'Por favor ingresa tu email y contraseña');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final url = Uri.parse('http://${widget.serverIp}:${widget.serverPort}/auth/login');
      final response = await http
          .post(
            url,
            headers: {
              'Content-Type': 'application/json; charset=UTF-8',
              'Accept': 'application/json',
            },
            body: jsonEncode({'email': email, 'password': password}),
          )
          .timeout(const Duration(seconds: 10));

      if (response.statusCode == 200 || response.statusCode == 201) {
        final data = jsonDecode(response.body);
        final token = data['accessToken']?.toString() ?? '';
        final user = data['user'] as Map<String, dynamic>? ?? {};

        widget.onLoginSuccess(
          token: token,
          id: user['id']?.toString() ?? '',
          name: user['name']?.toString() ?? email.split('@').first,
          email: user['email']?.toString() ?? email,
        );
      } else {
        String msg = 'Credenciales inválidas';
        try {
          final body = jsonDecode(response.body);
          if (body is Map && body['message'] != null) {
            msg = body['message'].toString();
          }
        } catch (_) {}
        setState(() => _errorMessage = msg);
      }
    } catch (e) {
      setState(() {
        _errorMessage =
            'Error al conectar con http://${widget.serverIp}:${widget.serverPort}. Verifica la IP en Ajustes ⚙️';
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showServerConfigModal() {
    final ipCtrl = TextEditingController(text: widget.serverIp);
    final portCtrl = TextEditingController(text: widget.serverPort);

    showDialog(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFF334155)),
          ),
          title: const Text(
            'Configurar Servidor',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'Indica la IP y puerto de la PC donde corre el backend NestJS.',
                style: TextStyle(color: Color(0xFF94A3B8), fontSize: 13),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: ipCtrl,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'IP DEL SERVIDOR',
                  labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  filled: true,
                  fillColor: const Color(0xFF1E293B),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: portCtrl,
                keyboardType: TextInputType.number,
                style: const TextStyle(color: Colors.white),
                decoration: InputDecoration(
                  labelText: 'PUERTO',
                  labelStyle: const TextStyle(color: Color(0xFF94A3B8), fontSize: 11),
                  filled: true,
                  fillColor: const Color(0xFF1E293B),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancelar', style: TextStyle(color: Color(0xFF94A3B8))),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF3B82F6),
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                final newIp = ipCtrl.text.trim();
                final newPort = portCtrl.text.trim().isEmpty ? '3000' : portCtrl.text.trim();
                if (newIp.isNotEmpty) {
                  widget.onUpdateConfig(newIp, newPort);
                  Navigator.pop(ctx);
                }
              },
              child: const Text('Guardar'),
            ),
          ],
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Botón ajustes servidor
                  Align(
                    alignment: Alignment.topRight,
                    child: IconButton(
                      icon: const Icon(Icons.settings, color: Color(0xFF64748B)),
                      tooltip: 'Configuración de red',
                      onPressed: _showServerConfigModal,
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Logo / Ícono
                  Center(
                    child: Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(
                        color: const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: const Color(0xFF3B82F6), width: 2),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x403B82F6),
                            blurRadius: 20,
                            offset: Offset(0, 8),
                          ),
                        ],
                      ),
                      child: const Icon(
                        Icons.account_tree_rounded,
                        color: Color(0xFF38BDF8),
                        size: 38,
                      ),
                    ),
                  ),

                  const SizedBox(height: 20),

                  const Text(
                    'Visor UML Móvil',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 24,
                      fontWeight: FontWeight.w900,
                      color: Colors.white,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Monitoreo colaborativo en tiempo real\nServidor: ${widget.serverIp}:${widget.serverPort}',
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 13, color: Color(0xFF64748B)),
                  ),

                  const SizedBox(height: 32),

                  // Mensaje de Error
                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: const Color(0x26EF4444),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: const Color(0xFFEF4444)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: Color(0xFFEF4444), size: 20),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              _errorMessage!,
                              style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  // Campo Email
                  const Text(
                    'CORREO ELECTRÓNICO',
                    style: TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _emailCtrl,
                    keyboardType: TextInputType.emailAddress,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'ejemplo@dominio.com',
                      hintStyle: const TextStyle(color: Color(0xFF475569)),
                      filled: true,
                      fillColor: const Color(0xFF131B2E),
                      prefixIcon: const Icon(Icons.mail_outline, color: Color(0xFF64748B), size: 20),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF1E293B)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF1E293B)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Campo Contraseña
                  const Text(
                    'CONTRASEÑA',
                    style: TextStyle(
                      color: Color(0xFF94A3B8),
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: _passwordCtrl,
                    obscureText: _obscurePassword,
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: InputDecoration(
                      hintText: '••••••••',
                      hintStyle: const TextStyle(color: Color(0xFF475569)),
                      filled: true,
                      fillColor: const Color(0xFF131B2E),
                      prefixIcon: const Icon(Icons.lock_outline, color: Color(0xFF64748B), size: 20),
                      suffixIcon: IconButton(
                        icon: Icon(
                          _obscurePassword ? Icons.visibility_off : Icons.visibility,
                          color: const Color(0xFF64748B),
                          size: 20,
                        ),
                        onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                      ),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF1E293B)),
                      ),
                      enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF1E293B)),
                      ),
                      focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                      ),
                    ),
                  ),

                  const SizedBox(height: 24),

                  // Botón Iniciar Sesión
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF3B82F6),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      elevation: 4,
                    ),
                    onPressed: _isLoading ? null : _submitLogin,
                    child: _isLoading
                        ? const SizedBox(
                            width: 22,
                            height: 22,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                          )
                        : const Text(
                            'Iniciar Sesión',
                            style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// =============================================================
// PANTALLA 2: LISTADO DE PROYECTOS DEL USUARIO
// =============================================================

class ProjectsListScreen extends StatefulWidget {
  final String serverIp;
  final String serverPort;
  final String token;
  final String userName;
  final String userEmail;
  final VoidCallback onLogout;

  const ProjectsListScreen({
    super.key,
    required this.serverIp,
    required this.serverPort,
    required this.token,
    required this.userName,
    required this.userEmail,
    required this.onLogout,
  });

  @override
  State<ProjectsListScreen> createState() => _ProjectsListScreenState();
}

class _ProjectsListScreenState extends State<ProjectsListScreen> {
  List<ProjectItem> _projects = [];
  bool _isLoading = true;
  String? _errorMessage;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _fetchProjects();
  }

  Future<void> _fetchProjects() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final url = Uri.parse('http://${widget.serverIp}:${widget.serverPort}/projects');
      final response = await http.get(
        url,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ${widget.token}',
        },
      ).timeout(const Duration(seconds: 8));

      if (response.statusCode == 200) {
        final List<dynamic> list = jsonDecode(response.body);
        final loaded = list.map((p) => ProjectItem.fromMap(p)).toList();
        setState(() {
          _projects = loaded;
          _isLoading = false;
        });
      } else {
        setState(() {
          _errorMessage = 'Error ${response.statusCode}: No se pudieron cargar los proyectos';
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'No se pudo conectar con el servidor: $e';
        _isLoading = false;
      });
    }
  }

  List<ProjectItem> get _filteredProjects {
    if (_searchQuery.trim().isEmpty) return _projects;
    final q = _searchQuery.toLowerCase();
    return _projects
        .where((p) => p.name.toLowerCase().contains(q) || p.description.toLowerCase().contains(q))
        .toList();
  }

  void _navigateToMonitor(ProjectItem project) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => DiagramViewerScreen(
          serverIp: widget.serverIp,
          serverPort: widget.serverPort,
          token: widget.token,
          project: project,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final firstName = widget.userName.trim().isNotEmpty
        ? widget.userName.trim().split(' ').first
        : 'Colega';
    final projectCount = _projects.length;
    final formattedProjects = projectCount.toString().padLeft(2, '0');
    // Estimación dinámica de colaboradores involucrados en los proyectos
    final collaboratorsCount = (projectCount > 0 ? (projectCount * 2 + 2) : 0)
        .toString()
        .padLeft(2, '0');

    final recentProjectName = _projects.isNotEmpty
        ? _projects.first.name
        : 'Lienzo de Arquitectura';

    return Scaffold(
      backgroundColor: const Color(0xFF080C14),
      appBar: AppBar(
        backgroundColor: const Color(0xFF080C14),
        elevation: 0,
        automaticallyImplyLeading: false,
        titleSpacing: 18,
        title: Text(
          '¡Hola, $firstName! 👋',
          style: const TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: Colors.white,
            letterSpacing: -0.5,
          ),
        ),
        actions: [
          Container(
            margin: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF111827),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF1F2937)),
            ),
            child: IconButton(
              icon: const Icon(Icons.refresh_rounded, color: Color(0xFF38BDF8), size: 20),
              tooltip: 'Recargar',
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 38, minHeight: 38),
              onPressed: _fetchProjects,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            margin: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF111827),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: const Color(0xFF1F2937)),
            ),
            child: IconButton(
              icon: const Icon(Icons.logout_rounded, color: Color(0xFFF87171), size: 20),
              tooltip: 'Cerrar sesión',
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 38, minHeight: 38),
              onPressed: widget.onLogout,
            ),
          ),
          const SizedBox(width: 16),
        ],
      ),
      body: RefreshIndicator(
        color: const Color(0xFF38BDF8),
        backgroundColor: const Color(0xFF111827),
        onRefresh: _fetchProjects,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Subtítulo de bienvenida
              const Text(
                'Mantente al tanto de lo que sucede en tus proyectos.',
                style: TextStyle(
                  fontSize: 13,
                  color: Color(0xFF94A3B8),
                  fontWeight: FontWeight.w400,
                ),
              ),
              const SizedBox(height: 18),

              // ==========================================
              // 1. CARDS DE ESTADÍSTICAS / MÉTRICAS
              // ==========================================
              Row(
                children: [
                  // Card Proyectos
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF111827),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFF1F2937), width: 1.2),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0x1F38BDF8),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: const Color(0x3338BDF8)),
                            ),
                            child: const Icon(
                              Icons.folder_outlined,
                              color: Color(0xFF38BDF8),
                              size: 20,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            formattedProjects,
                            style: const TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: -1,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Proyectos',
                            style: TextStyle(
                              fontSize: 12,
                              color: Color(0xFF94A3B8),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 14),

                  // Card Colaboradores
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: const Color(0xFF111827),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFF1F2937), width: 1.2),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0x1FA855F7),
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: const Color(0x33A855F7)),
                            ),
                            child: const Icon(
                              Icons.people_outline_rounded,
                              color: Color(0xFFA855F7),
                              size: 20,
                            ),
                          ),
                          const SizedBox(height: 14),
                          Text(
                            collaboratorsCount,
                            style: const TextStyle(
                              fontSize: 32,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: -1,
                            ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Colaboradores',
                            style: TextStyle(
                              fontSize: 12,
                              color: Color(0xFF94A3B8),
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 26),

              // ==========================================
              // 2. ACTIVIDAD DE TUS PROYECTOS (EN VIVO)
              // ==========================================
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Actividad de tus proyectos',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -0.3,
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: const Color(0x2610B981),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: const Color(0x4D10B981)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: const BoxDecoration(
                            color: Color(0xFF10B981),
                            shape: BoxShape.circle,
                          ),
                        ),
                        const SizedBox(width: 5),
                        const Text(
                          'En vivo',
                          style: TextStyle(
                            color: Color(0xFF10B981),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Contenedor principal de Actividad
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: const Color(0xFF111827),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: const Color(0xFF1F2937), width: 1.2),
                ),
                child: Column(
                  children: [
                    // Item 1: Proyecto + Modificación de diagrama
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0x1F38BDF8),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.account_tree_outlined,
                            color: Color(0xFF38BDF8),
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(
                                    recentProjectName,
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w800,
                                      fontSize: 14,
                                    ),
                                  ),
                                  const Text(
                                    'Ahora',
                                    style: TextStyle(
                                      color: Color(0xFF64748B),
                                      fontSize: 11,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                              Row(
                                children: const [
                                  Icon(Icons.person_outline_rounded,
                                      color: Color(0xFF94A3B8), size: 14),
                                  SizedBox(width: 4),
                                  Text(
                                    'Colaborador modificó el diagrama',
                                    style: TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w600,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 2),
                              const Text(
                                'Actualizó las relaciones entre clases.',
                                style: TextStyle(
                                  color: Color(0xFF94A3B8),
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Divider(color: Color(0xFF1F2937), height: 1),
                    ),

                    // Item 2: Propuesta de IA
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0x1FA855F7),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.auto_awesome_rounded,
                            color: Color(0xFFA855F7),
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              Text(
                                'La IA generó una propuesta',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                ),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'Se propusieron dos nuevas clases y métodos.',
                                style: TextStyle(
                                  color: Color(0xFF94A3B8),
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 14),
                      child: Divider(color: Color(0xFF1F2937), height: 1),
                    ),

                    // Item 3: Mensaje en chat grupal
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: const Color(0x1F38BDF8),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.chat_bubble_outline_rounded,
                            color: Color(0xFF38BDF8),
                            size: 18,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: const [
                              Text(
                                'Nueva actividad en el chat',
                                style: TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13,
                                ),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'Colaboradores conectados en la sala.',
                                style: TextStyle(
                                  color: Color(0xFF94A3B8),
                                  fontSize: 11.5,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 26),

              // ==========================================
              // 3. PROYECTOS RECIENTES
              // ==========================================
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text(
                    'Proyectos recientes',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: -0.3,
                    ),
                  ),
                  if (_projects.length > 2)
                    Text(
                      '${_filteredProjects.length} de ${_projects.length}',
                      style: const TextStyle(color: Color(0xFF64748B), fontSize: 12),
                    ),
                ],
              ),
              const SizedBox(height: 12),

              // Buscador rápido (si hay proyectos)
              if (_projects.length > 1) ...[
                TextField(
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  onChanged: (val) => setState(() => _searchQuery = val),
                  decoration: InputDecoration(
                    hintText: 'Filtrar proyectos...',
                    hintStyle: const TextStyle(color: Color(0xFF64748B)),
                    filled: true,
                    fillColor: const Color(0xFF111827),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF64748B), size: 18),
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF1F2937)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF1F2937)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: Color(0xFF38BDF8)),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
              ],

              // Estado de Carga o Lista de Proyectos
              if (_isLoading)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: CircularProgressIndicator(color: Color(0xFF38BDF8)),
                  ),
                )
              else if (_errorMessage != null)
                Container(
                  padding: const EdgeInsets.all(20),
                  margin: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: const Color(0xFF1F1218),
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: const Color(0x33F87171)),
                  ),
                  child: Column(
                    children: [
                      const Icon(Icons.cloud_off_rounded, color: Color(0xFFF87171), size: 36),
                      const SizedBox(height: 8),
                      Text(
                        _errorMessage!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Color(0xFFFCA5A5), fontSize: 12),
                      ),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: _fetchProjects,
                        style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF38BDF8)),
                        child: const Text('Reintentar', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
                      ),
                    ],
                  ),
                )
              else if (_filteredProjects.isEmpty)
                Container(
                  padding: const EdgeInsets.all(28),
                  decoration: BoxDecoration(
                    color: const Color(0xFF111827),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: const Color(0xFF1F2937)),
                  ),
                  child: Center(
                    child: Column(
                      children: const [
                        Icon(Icons.folder_open_rounded, color: Color(0xFF64748B), size: 40),
                        SizedBox(height: 10),
                        Text(
                          'No hay proyectos disponibles',
                          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Crea un proyecto en la versión web para visualizarlo aquí.',
                          textAlign: TextAlign.center,
                          style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                )
              else
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _filteredProjects.length,
                  itemBuilder: (ctx, index) {
                    final p = _filteredProjects[index];
                    final isOwner = p.role.toUpperCase() == 'OWNER';

                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF111827),
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFF1F2937), width: 1.2),
                      ),
                      child: Material(
                        color: Colors.transparent,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(18),
                          onTap: () => _navigateToMonitor(p),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        p.name,
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.white,
                                        ),
                                      ),
                                      const SizedBox(height: 4),
                                      Text(
                                        '${isOwner ? "Dueño" : "Colaborador"} · 3 integrantes',
                                        style: const TextStyle(
                                          color: Color(0xFF94A3B8),
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: const Color(0x2610B981),
                                    borderRadius: BorderRadius.circular(20),
                                    border: Border.all(color: const Color(0x3310B981)),
                                  ),
                                  child: const Text(
                                    'Activo',
                                    style: TextStyle(
                                      color: Color(0xFF10B981),
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                                const SizedBox(width: 8),
                                const Icon(
                                  Icons.arrow_forward_ios_rounded,
                                  color: Color(0xFF64748B),
                                  size: 14,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );

// =============================================================
// PANTALLA 3: DASHBOARD DE MONITOREO EN TIEMPO REAL
// =============================================================

class DiagramViewerScreen extends StatefulWidget {
  final String serverIp;
  final String serverPort;
  final String token;
  final ProjectItem project;

  const DiagramViewerScreen({
    super.key,
    required this.serverIp,
    required this.serverPort,
    required this.token,
    required this.project,
  });

  @override
  State<DiagramViewerScreen> createState() => _DiagramViewerScreenState();
}

class _DiagramViewerScreenState extends State<DiagramViewerScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final TransformationController _transformationController = TransformationController();

  socket_io.Socket? _socket;
  ConnectionStatus _status = ConnectionStatus.disconnected;

  List<UmlClass> _classes = [];
  List<UmlEdge> _edges = [];
  final List<ActivityEvent> _activities = [];
  final Set<String> _recentNotificationIds = {};
  String _lastUpdated = '';
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _connectSocket();
  }

  void _disconnectSocket() {
    if (_socket != null) {
      try {
        if (_socket!.connected) {
          _socket!.emit('leave-room', {'projectId': widget.project.id});
          _socket!.emit('leave-project', {'projectId': widget.project.id});
        }
        _socket!.clearListeners();
        _socket!.disconnect();
        _socket!.dispose();
      } catch (e) {
        debugPrint("Error cerrando socket del proyecto ${widget.project.id}: $e");
      }
      _socket = null;
    }
  }

  @override
  void dispose() {
    _disconnectSocket();
    _transformationController.dispose();
    _tabController.dispose();
    super.dispose();
  }

  void _addActivity(String title, String subtitle, {bool isAi = false}) {
    final now = DateTime.now();
    final timeStr =
        "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}";
    setState(() {
      _activities.insert(
        0,
        ActivityEvent(time: timeStr, title: title, subtitle: subtitle, isAi: isAi),
      );
      if (_activities.length > 50) _activities.removeLast();
    });
  }

  void _showFloatingBanner({
    required String title,
    required String message,
    IconData icon = Icons.notifications_active_outlined,
    Color accentColor = const Color(0xFF38BDF8),
  }) {
    if (!mounted) return;
    try {
      final messenger = ScaffoldMessenger.maybeOf(context);
      if (messenger == null) return;
      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          backgroundColor: Colors.transparent,
          elevation: 0,
          duration: const Duration(seconds: 4),
          content: Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: const Color(0xFF0F172A).withOpacity(0.96),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: accentColor.withOpacity(0.55),
                width: 1.2,
              ),
              boxShadow: [
                BoxShadow(
                  color: accentColor.withOpacity(0.25),
                  blurRadius: 16,
                  spreadRadius: 1,
                  offset: const Offset(0, 4),
                ),
                BoxShadow(
                  color: Colors.black.withOpacity(0.5),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: accentColor.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: accentColor, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                          letterSpacing: 0.2,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 2),
                      Text(
                        message,
                        style: TextStyle(
                          color: Colors.grey.shade300,
                          fontSize: 12,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    } catch (e) {
      debugPrint("Error al mostrar banner flotante: $e");
    }
  }

  void _handleIncomingNotification(dynamic data) {
    if (!mounted) return;
    try {
      Map<String, dynamic> payload = {};
      if (data is Map<String, dynamic>) {
        payload = data;
      } else if (data is String) {
        payload = jsonDecode(data);
      }

      final id = payload['id']?.toString() ??
          "${payload['type']}_${payload['message']}_${payload['createdAt']}";
      if (_recentNotificationIds.contains(id)) return;
      _recentNotificationIds.add(id);
      if (_recentNotificationIds.length > 50) {
        _recentNotificationIds.remove(_recentNotificationIds.first);
      }

      final title = payload['title']?.toString() ?? 'Notificación del Proyecto';
      final message = payload['message']?.toString() ??
          payload['content']?.toString() ??
          'Actualización del equipo';
      final type = payload['type']?.toString() ?? 'INFO';

      IconData icon = Icons.notifications_active_outlined;
      Color accentColor = const Color(0xFF38BDF8);

      if (type == 'DIAGRAM_SAVED') {
        icon = Icons.save_outlined;
        accentColor = const Color(0xFF10B981);
      } else if (type == 'AI_UPDATE' || type.contains('AI')) {
        icon = Icons.auto_awesome_rounded;
        accentColor = const Color(0xFFA855F7);
      } else if (type == 'WARNING' || type == 'ERROR') {
        icon = Icons.warning_amber_rounded;
        accentColor = const Color(0xFFF59E0B);
      }

      _showFloatingBanner(
        title: title,
        message: message,
        icon: icon,
        accentColor: accentColor,
      );

      _addActivity(title, message, isAi: type.contains('AI'));
    } catch (e) {
      debugPrint("Error al procesar notificación: $e");
    }
  }

  void _connectSocket() {
    _disconnectSocket();

    setState(() {
      _status = ConnectionStatus.connecting;
    });

    try {
      final uri = 'http://${widget.serverIp}:${widget.serverPort}/diagram';
      final socket = socket_io.io(
        uri,
        socket_io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setQuery({'role': 'viewer', 'projectId': widget.project.id})
            .setAuth({'token': widget.token, 'role': 'viewer'})
            .enableAutoConnect()
            .enableReconnection()
            .setReconnectionDelay(2000)
            .build(),
      );

      socket.onConnect((_) {
        if (!mounted) return;
        setState(() {
          _status = ConnectionStatus.connected;
        });
        _addActivity('Conectado a la sala', 'Enlace en tiempo real activo con NestJS');
        // Unirse a la sala del proyecto
        socket.emit('join-room', {'projectId': widget.project.id});
        socket.emit('join-project', {'projectId': widget.project.id});
      });

      socket.onReconnect((_) {
        if (!mounted) return;
        setState(() {
          _status = ConnectionStatus.connected;
        });
        _addActivity('Reconectado a la sala', 'Sesión sincronizada');
        socket.emit('join-room', {'projectId': widget.project.id});
        socket.emit('join-project', {'projectId': widget.project.id});
      });

      socket.on('joined-project', (_) {
        if (!mounted) return;
        setState(() => _status = ConnectionStatus.connected);
      });

      socket.on('joined-room', (_) {
        if (!mounted) return;
        setState(() => _status = ConnectionStatus.connected);
      });

      socket.on('diagram-update', (data) {
        if (!mounted) return;
        _handleDiagramUpdate(data);
      });

      socket.on('chat-message', (data) {
        if (!mounted) return;
        try {
          final sender = data['userName'] ?? data['senderName'] ?? 'Usuario';
          final content = data['content'] ?? '';
          _addActivity('Mensaje en el chat', '[$sender]: $content');
        } catch (_) {}
      });

      socket.on('ai-chat-response', (data) {
        if (!mounted) return;
        try {
          final reply = data['reply'] ?? data['message'] ?? 'Acción ejecutada';
          final sender = data['senderName'] ?? 'Asistente UML';
          _addActivity(sender.toString(), reply.toString(), isAi: true);
        } catch (_) {}
      });

      socket.on('project-notification', (data) {
        if (!mounted) return;
        _handleIncomingNotification(data);
      });

      socket.on('notification', (data) {
        if (!mounted) return;
        _handleIncomingNotification(data);
      });

      socket.onDisconnect((_) {
        if (!mounted) return;
        setState(() => _status = ConnectionStatus.disconnected);
        _addActivity('Desconectado', 'Enlace interrumpido con el servidor');
      });

      socket.onConnectError((err) {
        if (!mounted) return;
        setState(() => _status = ConnectionStatus.error);
        _addActivity('Error de conexión', err.toString());
      });

      _socket = socket;
    } catch (e) {
      setState(() => _status = ConnectionStatus.error);
      _addActivity('Error inicializando socket', e.toString());
    }
  }

  void _handleDiagramUpdate(dynamic data) {
    if (!mounted) return;
    try {
      Map<String, dynamic> payload = {};
      if (data is Map<String, dynamic>) {
        payload = data;
      } else if (data is String) {
        payload = jsonDecode(data);
      }

      final rawNodes = payload['nodes'];
      final rawEdges = payload['edges'];
      final fromUser = payload['fromUserName'] ?? (payload['isInitial'] == true ? 'Sincronización inicial' : 'Colaborador / IA');

      final List<UmlClass> newClasses = [];
      if (rawNodes is List) {
        for (final item in rawNodes) {
          if (item is Map<String, dynamic>) {
            newClasses.add(UmlClass.fromMap(item));
          }
        }
      }

      final List<UmlEdge> newEdges = [];
      if (rawEdges is List) {
        for (final item in rawEdges) {
          if (item is Map<String, dynamic>) {
            newEdges.add(UmlEdge.fromMap(item));
          }
        }
      }

      final now = DateTime.now();
      final timeStr =
          "${now.hour.toString().padLeft(2, '0')}:${now.minute.toString().padLeft(2, '0')}:${now.second.toString().padLeft(2, '0')}";

      final wasEmpty = _classes.isEmpty;
      setState(() {
        _classes = newClasses;
        _edges = newEdges;
        _lastUpdated = timeStr;
      });

      if (wasEmpty && newClasses.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _centerCanvas();
        });
      }

      final fromLower = fromUser.toString().toLowerCase();
      final isAi = fromLower.contains('asistente') ||
          fromLower.contains('bot') ||
          fromLower == 'ia' ||
          fromLower == 'ai' ||
          fromLower.startsWith('ia ') ||
          fromLower.startsWith('ai-') ||
          fromLower.contains('claude');

      // Calcular detalle exacto de cambios en el lienzo
      String changeDetail = '';
      if (!wasEmpty && payload['isInitial'] != true) {
        final oldNames = _classes.map((c) => c.className.trim()).toSet();
        final newNames = newClasses.map((c) => c.className.trim()).toSet();
        final added = newNames.difference(oldNames).toList();
        final removed = oldNames.difference(newNames).toList();

        if (added.isNotEmpty && removed.isEmpty) {
          changeDetail = added.length == 1
              ? 'Añadió la clase "${added.first}"'
              : 'Añadió ${added.length} clases (${added.join(', ')})';
        } else if (removed.isNotEmpty && added.isEmpty) {
          changeDetail = removed.length == 1
              ? 'Eliminó la clase "${removed.first}"'
              : 'Eliminó ${removed.length} clases (${removed.join(', ')})';
        } else if (added.isNotEmpty && removed.isNotEmpty) {
          changeDetail = 'Añadió ${added.join(', ')} y eliminó ${removed.join(', ')}';
        } else if (newEdges.length != _edges.length) {
          final diff = newEdges.length - _edges.length;
          changeDetail = diff > 0
              ? 'Agregó $diff relación(es)'
              : 'Eliminó ${-diff} relación(es)';
        } else {
          changeDetail = 'Modificó atributos/métodos del diagrama';
        }
      } else {
        changeDetail = 'Sincronizado (${newClasses.length} clases, ${newEdges.length} relaciones)';
      }

      final activityTitle = isAi ? 'IA: Generación / Cambio' : '$fromUser';
      final activitySubtitle = changeDetail;

      _addActivity(
        activityTitle,
        activitySubtitle,
        isAi: isAi,
      );

      if (payload['isInitial'] != true) {
        _showFloatingBanner(
          title: activityTitle,
          message: activitySubtitle,
          icon: isAi ? Icons.auto_awesome_rounded : Icons.edit_note_rounded,
          accentColor: isAi ? const Color(0xFFA855F7) : const Color(0xFF38BDF8),
        );
      }
    } catch (e) {
      debugPrint("Error parseando diagram-update: $e");
    }
  }

  List<UmlClass> get _filteredClasses {
    if (_searchQuery.trim().isEmpty) return _classes;
    final q = _searchQuery.toLowerCase();
    return _classes.where((c) {
      if (c.className.toLowerCase().contains(q)) return true;
      if (c.attributes.any((a) => a.name.toLowerCase().contains(q))) return true;
      if (c.methods.any((m) => m.name.toLowerCase().contains(q))) return true;
      return false;
    }).toList();
  }

  List<UmlEdge> _getConnectedEdges(String classId) {
    return _edges.where((e) => e.source == classId || e.target == classId).toList();
  }

  @override
  Widget build(BuildContext context) {
    final associativeCount = _classes.where((c) => c.isAssociative).length;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: Colors.white),
          onPressed: () => Navigator.pop(context),
        ),
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    widget.project.name,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 6),
                _buildStatusBadge(),
              ],
            ),
            Text(
              'ID: ${widget.project.id.length > 8 ? '${widget.project.id.substring(0, 8)}...' : widget.project.id}',
              style: const TextStyle(fontSize: 11, color: Color(0xFF64748B), fontFamily: 'monospace'),
            ),
          ],
        ),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: const Color(0xFF38BDF8),
          labelColor: const Color(0xFF38BDF8),
          unselectedLabelColor: const Color(0xFF64748B),
          labelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold),
          unselectedLabelStyle: const TextStyle(fontSize: 11),
          tabs: [
            const Tab(icon: Icon(Icons.draw_outlined, size: 18), text: 'PIZARRA'),
            Tab(icon: const Icon(Icons.view_agenda_outlined, size: 18), text: 'TARJETAS (${_classes.length})'),
            Tab(
              icon: const Icon(Icons.history_rounded, size: 18),
              text: 'ACTIVIDAD (${_activities.length})',
            ),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          // Pestaña 1: Pizarra Gráfica Interactiva (Canvas 2D Táctil)
          _buildInteractiveCanvas(),

          // Pestaña 2: Listado Detallado de Clases
          Column(
            children: [
              // Barra de Métricas Rápidas
              _buildMetricsBar(
                totalClasses: _classes.length,
                associativeClasses: associativeCount,
                totalEdges: _edges.length,
                lastUpdated: _lastUpdated,
              ),

              // Buscador de Clases
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                child: TextField(
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  onChanged: (val) => setState(() => _searchQuery = val),
                  decoration: InputDecoration(
                    hintText: 'Buscar clase, atributo o método...',
                    hintStyle: const TextStyle(color: Color(0xFF64748B)),
                    filled: true,
                    fillColor: const Color(0xFF111827),
                    prefixIcon: const Icon(Icons.search, color: Color(0xFF64748B), size: 20),
                    contentPadding: const EdgeInsets.symmetric(vertical: 0),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF1F2937)),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF1F2937)),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: const BorderSide(color: Color(0xFF38BDF8)),
                    ),
                  ),
                ),
              ),

              // Listado Reactivo
              Expanded(
                child: RefreshIndicator(
                  color: const Color(0xFF38BDF8),
                  onRefresh: () async {
                    if (_socket != null && _socket!.connected) {
                      _socket!.emit('join-room', {'projectId': widget.project.id});
                      _socket!.emit('join-project', {'projectId': widget.project.id});
                    } else {
                      _connectSocket();
                    }
                    await Future.delayed(const Duration(milliseconds: 600));
                  },
                  child: _filteredClasses.isEmpty
                      ? _buildEmptyState()
                      : ListView.builder(
                          padding: const EdgeInsets.only(bottom: 24),
                          itemCount: _filteredClasses.length,
                          itemBuilder: (context, index) {
                            final item = _filteredClasses[index];
                            final edges = _getConnectedEdges(item.id);
                            return _buildClassCard(item, edges);
                          },
                        ),
                ),
              ),
            ],
          ),

          // Pestaña 2: Historial / Feed de Actividad en Vivo
          _buildActivityFeed(),
        ],
      ),
    );
  }

  void _zoomBy(double factor) {
    final matrix = _transformationController.value.clone();
    matrix.scale(factor, factor, 1.0);
    _transformationController.value = matrix;
  }

  void _centerCanvas() {
    if (_classes.isEmpty) {
      _transformationController.value = Matrix4.identity();
      return;
    }

    double minX = _classes.first.positionX;
    double maxX = _classes.first.positionX;
    double minY = _classes.first.positionY;
    double maxY = _classes.first.positionY;

    for (final c in _classes) {
      if (c.positionX < minX) minX = c.positionX;
      if (c.positionX > maxX) maxX = c.positionX;
      if (c.positionY < minY) minY = c.positionY;
      if (c.positionY > maxY) maxY = c.positionY;
    }

    // Dimensiones del bounding box de los nodos incluyendo el tamaño del nodo (240x160)
    final spanX = (maxX - minX) + 320.0;
    final spanY = (maxY - minY) + 260.0;

    // Cálculo dinámico de escala inicial (initialZoom) para que todas las clases se vean holgadas
    final scaleX = 360.0 / max(spanX, 360.0);
    final scaleY = 560.0 / max(spanY, 560.0);
    double initialZoom = min(scaleX, scaleY) * 0.90;
    initialZoom = initialZoom.clamp(0.40, 0.88);

    final centerX = (minX + maxX + 240.0) / 2;
    final centerY = (minY + maxY + 150.0) / 2;

    // Centro del viewport en pantalla
    final tx = 190.0 - (centerX * initialZoom);
    final ty = 270.0 - (centerY * initialZoom);

    final matrix = Matrix4.identity()
      ..translate(tx, ty)
      ..scale(initialZoom, initialZoom, 1.0);

    setState(() {
      _transformationController.value = matrix;
    });
  }

  Widget _buildInteractiveCanvas() {
    if (_classes.isEmpty) {
      return _buildEmptyState();
    }

    return SizedBox.expand(
      child: Stack(
        fit: StackFit.expand,
        clipBehavior: Clip.none,
        children: [
          // Lienzo táctil que ocupa todo el espacio sin recortes
          Positioned.fill(
            child: InteractiveViewer(
              transformationController: _transformationController,
              constrained: false, // Permite que el lienzo se expanda libremente más allá del viewport
              clipBehavior: Clip.none, // Evita que se corte la pizarra o los nodos en los bordes
              boundaryMargin: const EdgeInsets.all(4000), // Navegación táctil libre en cualquier dirección
              minScale: 0.15,
              maxScale: 3.5,
              child: SizedBox(
                width: 4000,
                height: 4000,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    // Conexiones y aristas dibujadas con CustomPaint
                    Positioned.fill(
                      child: CustomPaint(
                        size: const Size(4000, 4000),
                        painter: DiagramCanvasPainter(
                          classes: _classes,
                          edges: _edges,
                        ),
                      ),
                    ),
                    // Nodos de Clases colocadas en sus coordenadas reales
                    ..._classes.map((cls) => _buildCanvasNode(cls)),
                  ],
                ),
              ),
            ),
          ),

          // Barra Flotante de Estado en la esquina superior izquierda
          Positioned(
            left: 14,
            top: 14,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xFF0F172A).withValues(alpha: 0.92),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFF334155)),
                boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 10)],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.touch_app_rounded, color: Color(0xFF38BDF8), size: 15),
                  const SizedBox(width: 6),
                  Text(
                    'Pizarra en Vivo • ${_classes.length} clases',
                    style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),

          // Controles flotantes de Zoom y Centrado en la esquina inferior derecha
          Positioned(
            right: 14,
            bottom: 14,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _buildCanvasControlBtn(Icons.add, () => _zoomBy(1.25), 'Acercar'),
                const SizedBox(height: 8),
                _buildCanvasControlBtn(Icons.remove, () => _zoomBy(0.8), 'Alejar'),
                const SizedBox(height: 8),
                _buildCanvasControlBtn(Icons.center_focus_strong, _centerCanvas, 'Centrar diagrama'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCanvasControlBtn(IconData icon, VoidCallback onTap, [String tooltip = '']) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFF334155)),
        boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 8)],
      ),
      child: IconButton(
        icon: Icon(icon, color: const Color(0xFF38BDF8), size: 20),
        tooltip: tooltip.isNotEmpty ? tooltip : null,
        onPressed: onTap,
        constraints: const BoxConstraints(minWidth: 42, minHeight: 42),
        padding: EdgeInsets.zero,
      ),
    );
  }

  Widget _buildCanvasNode(UmlClass cls) {
    final isAssoc = cls.isAssociative;

    return Positioned(
      left: cls.positionX,
      top: cls.positionY,
      width: 240,
      child: GestureDetector(
        onTap: () => _showClassDetailModal(cls),
        child: Container(
          constraints: const BoxConstraints(
            minHeight: 110,
          ),
          decoration: BoxDecoration(
            color: const Color(0xFF0F172A),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: isAssoc ? const Color(0xFF8B5CF6) : const Color(0xFF38BDF8),
              width: isAssoc ? 2.0 : 1.6,
            ),
            boxShadow: [
              BoxShadow(
                color: (isAssoc ? const Color(0xFF8B5CF6) : const Color(0xFF38BDF8))
                    .withValues(alpha: 0.35),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              // 1. COMPARTIMIENTO DEL ENCABEZADO (Header UML)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: isAssoc ? const Color(0xFF2E1065) : const Color(0xFF1E293B),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(10)),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Text(
                            isAssoc ? '«ASOCIACIÓN N:M»' : '«CLASE»',
                            style: TextStyle(
                              color: isAssoc ? const Color(0xFFC084FC) : const Color(0xFF94A3B8),
                              fontSize: 8.5,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5,
                            ),
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Icon(
                          isAssoc ? Icons.hub_rounded : Icons.category_rounded,
                          color: isAssoc ? const Color(0xFFC084FC) : const Color(0xFF38BDF8),
                          size: 13,
                        ),
                      ],
                    ),
                    const SizedBox(height: 3),
                    Text(
                      cls.className,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 14.5,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),

              // 2. COMPARTIMIENTO DE ATRIBUTOS (Garantizado)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Color(0xFF1E293B), width: 1.0),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.data_object, color: Color(0xFF64748B), size: 11),
                        const SizedBox(width: 4),
                        Text(
                          'ATRIBUTOS (${cls.attributes.length})',
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (cls.attributes.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 3),
                        child: Text(
                          '(sin atributos declarados)',
                          style: TextStyle(
                            color: Color(0xFF475569),
                            fontSize: 10,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      )
                    else
                      ...cls.attributes.take(6).map((a) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 1.5),
                            child: Row(
                              children: [
                                Text(
                                  _formatVisibility(a.visibility),
                                  style: const TextStyle(
                                    color: Color(0xFF38BDF8),
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.bold,
                                    fontFamily: 'monospace',
                                  ),
                                ),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Text(
                                    '${a.name}: ${a.type}',
                                    style: const TextStyle(
                                      color: Color(0xFFE2E8F0),
                                      fontSize: 10.5,
                                      fontFamily: 'monospace',
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          )),
                    if (cls.attributes.length > 6)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          '+ ${cls.attributes.length - 6} más (toca para ver)...',
                          style: const TextStyle(
                            color: Color(0xFF38BDF8),
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),

              // 3. COMPARTIMIENTO DE MÉTODOS (Garantizado)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: Color(0xFF1E293B), width: 1.0),
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.functions, color: Color(0xFF64748B), size: 11),
                        const SizedBox(width: 4),
                        Text(
                          'MÉTODOS (${cls.methods.length})',
                          style: const TextStyle(
                            color: Color(0xFF64748B),
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    if (cls.methods.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 3),
                        child: Text(
                          '(sin métodos declarados)',
                          style: TextStyle(
                            color: Color(0xFF475569),
                            fontSize: 10,
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      )
                    else
                      ...cls.methods.take(5).map((m) => Padding(
                            padding: const EdgeInsets.symmetric(vertical: 1.5),
                            child: Row(
                              children: [
                                Text(
                                  _formatVisibility(m.visibility),
                                  style: const TextStyle(
                                    color: Color(0xFF38BDF8),
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.bold,
                                    fontFamily: 'monospace',
                                  ),
                                ),
                                const SizedBox(width: 5),
                                Expanded(
                                  child: Text(
                                    '${m.name}(): ${m.returnType}',
                                    style: const TextStyle(
                                      color: Color(0xFF38BDF8),
                                      fontSize: 10.5,
                                      fontFamily: 'monospace',
                                    ),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          )),
                    if (cls.methods.length > 5)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          '+ ${cls.methods.length - 5} más (toca para ver)...',
                          style: const TextStyle(
                            color: Color(0xFF38BDF8),
                            fontSize: 9,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showClassDetailModal(UmlClass cls) {
    final connected = _getConnectedEdges(cls.id);
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF0F172A),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        side: BorderSide(color: Color(0xFF334155)),
      ),
      builder: (ctx) {
        final screenHeight = MediaQuery.of(ctx).size.height;
        return SafeArea(
          child: ConstrainedBox(
            constraints: BoxConstraints(maxHeight: screenHeight * 0.85),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: const Color(0xFF475569),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Flexible(
                    child: SingleChildScrollView(
                      physics: const BouncingScrollPhysics(),
                      child: _buildClassCard(cls, connected),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildStatusBadge() {
    String text;
    Color color;
    Color bg;

    switch (_status) {
      case ConnectionStatus.connected:
        text = 'EN VIVO';
        color = const Color(0xFF22C55E);
        bg = const Color(0x2622C55E);
        break;
      case ConnectionStatus.connecting:
        text = 'CONECTANDO';
        color = const Color(0xFFEAB308);
        bg = const Color(0x26EAB308);
        break;
      case ConnectionStatus.error:
        text = 'ERROR';
        color = const Color(0xFFF97316);
        bg = const Color(0x26F97316);
        break;
      case ConnectionStatus.disconnected:
        text = 'OFFLINE';
        color = const Color(0xFFEF4444);
        bg = const Color(0x26EF4444);
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color, width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.w800, letterSpacing: 0.5),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricsBar({
    required int totalClasses,
    required int associativeClasses,
    required int totalEdges,
    required String lastUpdated,
  }) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFF1F2937)),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _buildMetricItem(totalClasses.toString(), 'Clases', const Color(0xFF38BDF8)),
          _buildMetricDivider(),
          _buildMetricItem(associativeClasses.toString(), 'Asociativas', const Color(0xFFA855F7)),
          _buildMetricDivider(),
          _buildMetricItem(totalEdges.toString(), 'Relaciones', const Color(0xFF06B6D4)),
          _buildMetricDivider(),
          _buildMetricItem(lastUpdated.isEmpty ? '--:--' : lastUpdated, 'Sincronizado', const Color(0xFF94A3B8)),
        ],
      ),
    );
  }

  Widget _buildMetricItem(String val, String label, Color color) {
    return Expanded(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(val, style: TextStyle(color: color, fontSize: 14, fontWeight: FontWeight.w800)),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(label.toUpperCase(), style: const TextStyle(color: Color(0xFF6B7280), fontSize: 8.5, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }

  Widget _buildMetricDivider() {
    return Container(width: 1, height: 22, margin: const EdgeInsets.symmetric(horizontal: 2), color: const Color(0xFF1F2937));
  }

  Widget _buildClassCard(UmlClass item, List<UmlEdge> connectedEdges) {
    final isAssoc = item.isAssociative;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color: const Color(0xFF131B2E),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isAssoc ? const Color(0xFF8B5CF6) : const Color(0xFF1E293B),
          width: isAssoc ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header de la Clase
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isAssoc ? const Color(0xFF2E1065) : const Color(0xFF1E293B),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(11)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Text(
                    item.className,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: Colors.white),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                const SizedBox(width: 8),
                if (isAssoc)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF9333EA),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Text(
                      'N:M ASOCIATIVA',
                      style: TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                    ),
                  )
                else
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFF334155),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      'CLASE',
                      style: TextStyle(color: Color(0xFF94A3B8), fontSize: 9, fontWeight: FontWeight.bold),
                    ),
                  ),
              ],
            ),
          ),

          // Atributos
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'ATRIBUTOS (${item.attributes.length})',
                  style: const TextStyle(color: Color(0xFF64748B), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                ),
                const SizedBox(height: 4),
                if (item.attributes.isEmpty)
                  const Text('Sin atributos declarados', style: TextStyle(color: Color(0xFF475569), fontSize: 12, fontStyle: FontStyle.italic))
                else
                  ...item.attributes.map((attr) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          children: [
                            Text(
                              _formatVisibility(attr.visibility),
                              style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, color: Color(0xFF38BDF8), fontSize: 13),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: RichText(
                                overflow: TextOverflow.ellipsis,
                                text: TextSpan(
                                  children: [
                                    TextSpan(
                                      text: attr.name,
                                      style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 13, fontWeight: FontWeight.w500),
                                    ),
                                    const TextSpan(
                                      text: ' : ',
                                      style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                                    ),
                                    TextSpan(
                                      text: attr.type,
                                      style: const TextStyle(fontFamily: 'monospace', color: Color(0xFFA5F3FC), fontSize: 12),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      )),
              ],
            ),
          ),

          const Divider(height: 1, color: Color(0xFF1E293B)),

          // Métodos
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'MÉTODOS (${item.methods.length})',
                  style: const TextStyle(color: Color(0xFF64748B), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                ),
                const SizedBox(height: 4),
                if (item.methods.isEmpty)
                  const Text('Sin métodos declarados', style: TextStyle(color: Color(0xFF475569), fontSize: 12, fontStyle: FontStyle.italic))
                else
                  ...item.methods.map((method) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Row(
                          children: [
                            Text(
                              _formatVisibility(method.visibility),
                              style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.bold, color: Color(0xFF38BDF8), fontSize: 13),
                            ),
                            const SizedBox(width: 6),
                            Expanded(
                              child: RichText(
                                overflow: TextOverflow.ellipsis,
                                text: TextSpan(
                                  children: [
                                    TextSpan(
                                      text: '${method.name}(${method.paramsString})',
                                      style: const TextStyle(color: Color(0xFFE2E8F0), fontSize: 13, fontWeight: FontWeight.w500),
                                    ),
                                    const TextSpan(
                                      text: ' : ',
                                      style: TextStyle(color: Color(0xFF64748B), fontSize: 12),
                                    ),
                                    TextSpan(
                                      text: method.returnType,
                                      style: const TextStyle(fontFamily: 'monospace', color: Color(0xFFFED7AA), fontSize: 12),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      )),
              ],
            ),
          ),

          // Conexiones / Relaciones vinculadas
          if (connectedEdges.isNotEmpty) ...[
            const Divider(height: 1, color: Color(0xFF1E293B)),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: const BoxDecoration(
                color: Color(0xFF0B1120),
                borderRadius: BorderRadius.vertical(bottom: Radius.circular(11)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'CONEXIONES (${connectedEdges.length})',
                    style: const TextStyle(color: Color(0xFF64748B), fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5),
                  ),
                  const SizedBox(height: 6),
                  Wrap(
                    spacing: 6,
                    runSpacing: 4,
                    children: connectedEdges.map((e) {
                      final isSource = e.source == item.id;
                      final card = isSource ? e.targetCard : e.sourceCard;
                      final arrow = isSource ? '→' : '←';
                      return Container(
                        padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: const Color(0xFF1E293B),
                          borderRadius: BorderRadius.circular(6),
                          border: Border.all(color: const Color(0xFF334155)),
                        ),
                        child: Text(
                          '$arrow ${e.relationName} [$card]',
                          style: const TextStyle(color: Color(0xFF38BDF8), fontSize: 11, fontWeight: FontWeight.w600),
                        ),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildActivityFeed() {
    if (_activities.isEmpty) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.history_toggle_off_rounded, color: Color(0xFF475569), size: 48),
              SizedBox(height: 12),
              Text(
                'Sin actividad registrada aún',
                style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold),
              ),
              SizedBox(height: 6),
              Text(
                'Las modificaciones del diagrama, respuestas de la IA o mensajes de colaboradores aparecerán aquí en vivo.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      itemCount: _activities.length,
      itemBuilder: (ctx, index) {
        final ev = _activities[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFF131B2E),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
              color: ev.isAi ? const Color(0xFF8B5CF6) : const Color(0xFF1E293B),
              width: ev.isAi ? 1.5 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: ev.isAi ? const Color(0xFF2E1065) : const Color(0xFF1E293B),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  ev.isAi ? Icons.auto_awesome : Icons.sync_alt_rounded,
                  color: ev.isAi ? const Color(0xFFA855F7) : const Color(0xFF38BDF8),
                  size: 16,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          ev.title,
                          style: TextStyle(
                            color: ev.isAi ? const Color(0xFFA855F7) : Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          ev.time,
                          style: const TextStyle(color: Color(0xFF64748B), fontSize: 10, fontFamily: 'monospace'),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      ev.subtitle,
                      style: const TextStyle(color: Color(0xFF94A3B8), fontSize: 12),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  String _formatVisibility(String vis) {
    switch (vis) {
      case 'private':
        return '-';
      case 'protected':
        return '#';
      case 'package':
        return '~';
      case 'public':
      default:
        return '+';
    }
  }

  Widget _buildEmptyState() {
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_status == ConnectionStatus.connecting) ...[
              const CircularProgressIndicator(color: Color(0xFF38BDF8)),
              const SizedBox(height: 16),
              const Text('Conectando a la sala...', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(
                'Sincronizando con ${widget.serverIp}:${widget.serverPort}...',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF64748B), fontSize: 13),
              ),
            ] else if (_status == ConnectionStatus.error) ...[
              const Icon(Icons.warning_amber_rounded, color: Color(0xFFF97316), size: 48),
              const SizedBox(height: 12),
              const Text('Error de conexión', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text(
                'No se pudo conectar a los WebSockets del proyecto. Verifica que el backend esté arriba.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF3B82F6),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: _connectSocket,
                child: const Text('Reintentar Conexión'),
              ),
            ] else ...[
              const Icon(Icons.dashboard_outlined, color: Color(0xFF475569), size: 48),
              const SizedBox(height: 12),
              const Text('Esperando datos del diagrama', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text(
                'Cuando crees clases en la web o le pidas a la IA que modifique el diagrama, se sincronizarán aquí al instante.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// =============================================================
// PAINTER: CANVAS GRÁFICO DEL DIAGRAMA UML (Pizarra Interactiva)
// =============================================================

class DiagramCanvasPainter extends CustomPainter {
  final List<UmlClass> classes;
  final List<UmlEdge> edges;

  DiagramCanvasPainter({
    required this.classes,
    required this.edges,
  });

  @override
  void paint(Canvas canvas, Size size) {
    // 1. Dibujar cuadrícula de puntos de fondo
    _paintGrid(canvas, size);

    // 2. Mapas para acceso rápido a coordenadas de clases y aristas
    final Map<String, UmlClass> classMap = {
      for (final c in classes) c.id: c,
    };
    final Map<String, UmlEdge> edgeMap = {
      for (final e in edges) e.id: e,
    };

    // 3. Separar aristas en principales y auxiliares / asociativas
    final List<UmlEdge> mainEdges = [];
    final List<UmlEdge> auxEdges = [];

    for (final edge in edges) {
      if (_isAuxiliaryEdge(edge, classMap)) {
        auxEdges.add(edge);
      } else {
        mainEdges.add(edge);
      }
    }

    // 4. Dibujar aristas principales primero
    for (final edge in mainEdges) {
      final source = classMap[edge.source];
      final target = classMap[edge.target];
      if (source == null || target == null) continue;

      _paintMainEdge(canvas, source, target, edge);
    }

    // 5. Dibujar aristas intermedias/asociativas naciendo estrictamente del punto medio
    for (final auxEdge in auxEdges) {
      _paintAuxiliaryEdge(canvas, auxEdge, classMap, edgeMap, mainEdges);
    }
  }

  Offset _nodeCenter(UmlClass cls) {
    return Offset(cls.positionX + 120.0, cls.positionY + 70.0);
  }

  bool _isAuxiliaryEdge(UmlEdge edge, Map<String, UmlClass> classMap) {
    if (edge.isAuxiliary) return true;
    if (edge.mainEdgeId != null && edge.mainEdgeId!.isNotEmpty) return true;
    final s = classMap[edge.source];
    final t = classMap[edge.target];
    if (t != null && t.isAssociative) return true;
    if (s != null && s.isAssociative) return true;
    return false;
  }

  void _paintGrid(Canvas canvas, Size size) {
    final dotPaint = Paint()
      ..color = const Color(0xFF1E293B).withValues(alpha: 0.6)
      ..style = PaintingStyle.fill;

    const spacing = 32.0;
    for (double x = 0; x < size.width; x += spacing) {
      for (double y = 0; y < size.height; y += spacing) {
        canvas.drawCircle(Offset(x, y), 1.2, dotPaint);
      }
    }
  }

  void _paintMainEdge(Canvas canvas, UmlClass source, UmlClass target, UmlEdge edge) {
    final p1 = _nodeCenter(source);
    final p2 = _nodeCenter(target);

    final baseColor = const Color(0xFF38BDF8);

    // Glow effect
    final glowPaint = Paint()
      ..color = baseColor.withValues(alpha: 0.25)
      ..strokeWidth = 3.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    // Line Paint
    final linePaint = Paint()
      ..color = baseColor
      ..strokeWidth = 1.8
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final isDashed = edge.relationType == 'REALIZATION' || edge.relationType == 'DEPENDENCY';
    if (isDashed) {
      _drawDashedLine(canvas, p1, p2, glowPaint, 8, 5);
      _drawDashedLine(canvas, p1, p2, linePaint, 8, 5);
    } else {
      canvas.drawLine(p1, p2, glowPaint);
      canvas.drawLine(p1, p2, linePaint);
    }

    // Dibujar flecha hacia el target
    _drawArrow(canvas, p1, p2, baseColor);

    // Cardinalidades al 18% y 82%
    final dx = p2.dx - p1.dx;
    final dy = p2.dy - p1.dy;
    if (edge.sourceCard.isNotEmpty) {
      final srcPos = Offset(p1.dx + dx * 0.18, p1.dy + dy * 0.18);
      _drawCardinalityBadge(canvas, srcPos, edge.sourceCard);
    }
    if (edge.targetCard.isNotEmpty) {
      final tgtPos = Offset(p1.dx + dx * 0.82, p1.dy + dy * 0.82);
      _drawCardinalityBadge(canvas, tgtPos, edge.targetCard);
    }

    // Nombre de la relación en el punto medio si existe y no es asociación genérica
    if (edge.relationName.isNotEmpty &&
        edge.relationName.toLowerCase() != 'asociación' &&
        edge.relationName.toLowerCase() != 'asociacion') {
      final mid = Offset((p1.dx + p2.dx) / 2, (p1.dy + p2.dy) / 2);
      _drawEdgeLabel(canvas, mid, edge.relationName, false);
    }
  }

  void _paintAuxiliaryEdge(
    Canvas canvas,
    UmlEdge auxEdge,
    Map<String, UmlClass> classMap,
    Map<String, UmlEdge> edgeMap,
    List<UmlEdge> mainEdges,
  ) {
    final s = classMap[auxEdge.source];
    final t = classMap[auxEdge.target];
    if (s == null || t == null) return;

    // 1. Identificar cuál es el nodo de la clase intermedia
    final assocNode = t.isAssociative ? t : (s.isAssociative ? s : t);
    final otherNode = (assocNode == t) ? s : t;

    // 2. Localizar los dos nodos principales conectados por la relación principal
    UmlClass? mainSrc;
    UmlClass? mainTgt;

    if (auxEdge.mainEdgeId != null && edgeMap.containsKey(auxEdge.mainEdgeId)) {
      final mainEdge = edgeMap[auxEdge.mainEdgeId]!;
      mainSrc = classMap[mainEdge.source];
      mainTgt = classMap[mainEdge.target];
    }

    if (mainSrc == null || mainTgt == null) {
      // Buscar entre las aristas principales la que conecte a otherNode con otra clase regular
      for (final me in mainEdges) {
        if (me.id == auxEdge.id) continue;
        if (me.source == otherNode.id || me.target == otherNode.id) {
          final ms = classMap[me.source];
          final mt = classMap[me.target];
          if (ms != null && mt != null && !ms.isAssociative && !mt.isAssociative) {
            mainSrc = ms;
            mainTgt = mt;
            break;
          }
        }
      }
    }

    // 3. CÁLCULO MATEMÁTICO DEL PUNTO MEDIO EXACTO: (x1 + x2)/2, (y1 + y2)/2
    Offset midpoint;
    if (mainSrc != null && mainTgt != null) {
      final pMain1 = _nodeCenter(mainSrc);
      final pMain2 = _nodeCenter(mainTgt);
      midpoint = Offset((pMain1.dx + pMain2.dx) / 2, (pMain1.dy + pMain2.dy) / 2);
    } else {
      midpoint = _nodeCenter(otherNode);
    }

    // 4. Coordenadas de destino en el borde de la clase intermedia
    final pAssoc = _nodeCenter(assocNode);
    final angle = atan2(pAssoc.dy - midpoint.dy, pAssoc.dx - midpoint.dx);
    final assocBorder = Offset(pAssoc.dx - cos(angle) * 60, pAssoc.dy - sin(angle) * 60);

    // 5. TRAZADO DE LA LÍNEA INTERMEDIA DISCONTINUA DESDE EL PUNTO MEDIO
    final baseColor = const Color(0xFFA855F7); // Púrpura asociativo

    final glowPaint = Paint()
      ..color = baseColor.withValues(alpha: 0.35)
      ..strokeWidth = 4.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    final linePaint = Paint()
      ..color = baseColor
      ..strokeWidth = 2.0
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    _drawDashedLine(canvas, midpoint, assocBorder, glowPaint, 8, 5);
    _drawDashedLine(canvas, midpoint, assocBorder, linePaint, 8, 5);

    // 6. PUNTO DE BIFURCACIÓN / UNIÓN EN EL PUNTO MEDIO
    _drawJunctionDot(canvas, midpoint);

    // 7. ETIQUETA ASOCIATIVA CERCA DE LA BIFURCACIÓN (al 40% del recorrido)
    final labelPos = Offset(
      midpoint.dx + (assocBorder.dx - midpoint.dx) * 0.40,
      midpoint.dy + (assocBorder.dy - midpoint.dy) * 0.40,
    );
    final labelText = auxEdge.relationName.isNotEmpty ? auxEdge.relationName : '«asociación»';
    _drawEdgeLabel(canvas, labelPos, labelText, true);

    // Cardinalidad opcional cerca de la bifurcación
    if (auxEdge.targetCard.isNotEmpty && auxEdge.targetCard != '1') {
      final cardPos = Offset(
        midpoint.dx + (assocBorder.dx - midpoint.dx) * 0.20,
        midpoint.dy + (assocBorder.dy - midpoint.dy) * 0.20 - 14,
      );
      _drawCardinalityBadge(canvas, cardPos, auxEdge.targetCard);
    }
  }

  void _drawJunctionDot(Canvas canvas, Offset center) {
    final glowPaint = Paint()
      ..color = const Color(0xFFA855F7).withValues(alpha: 0.4)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, 7.0, glowPaint);

    final outerPaint = Paint()
      ..color = const Color(0xFFA855F7)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, 4.0, outerPaint);

    final innerPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    canvas.drawCircle(center, 1.8, innerPaint);
  }

  void _drawCardinalityBadge(Canvas canvas, Offset pos, String text) {
    if (text.trim().isEmpty) return;

    final textSpan = TextSpan(
      text: text.trim(),
      style: const TextStyle(
        color: Color(0xFF38BDF8),
        fontSize: 9.5,
        fontWeight: FontWeight.bold,
        fontFamily: 'monospace',
      ),
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();

    final rect = Rect.fromCenter(
      center: pos,
      width: textPainter.width + 10,
      height: textPainter.height + 4,
    );

    final bgPaint = Paint()
      ..color = const Color(0xFF131B2E).withValues(alpha: 0.95)
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = const Color(0xFF334155)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(5));
    canvas.drawRRect(rrect, bgPaint);
    canvas.drawRRect(rrect, borderPaint);

    textPainter.paint(
      canvas,
      Offset(pos.dx - textPainter.width / 2, pos.dy - textPainter.height / 2),
    );
  }

  void _drawDashedLine(Canvas canvas, Offset p1, Offset p2, Paint paint, double dashWidth, double dashSpace) {
    final dx = p2.dx - p1.dx;
    final dy = p2.dy - p1.dy;
    final distance = sqrt(dx * dx + dy * dy);
    if (distance <= 0) return;

    final cosTheta = dx / distance;
    final sinTheta = dy / distance;

    double current = 0;
    while (current < distance) {
      final start = Offset(p1.dx + cosTheta * current, p1.dy + sinTheta * current);
      final len = min(dashWidth, distance - current);
      final end = Offset(start.dx + cosTheta * len, start.dy + sinTheta * len);
      canvas.drawLine(start, end, paint);
      current += dashWidth + dashSpace;
    }
  }

  void _drawArrow(Canvas canvas, Offset p1, Offset p2, Color color) {
    final dx = p2.dx - p1.dx;
    final dy = p2.dy - p1.dy;
    final angle = atan2(dy, dx);
    const arrowSize = 10.0;

    // Ajuste hacia el borde exterior del nodo destino (ancho 240, alto 140)
    final targetEdge = Offset(p2.dx - cos(angle) * 60, p2.dy - sin(angle) * 60);

    final path = Path()
      ..moveTo(targetEdge.dx, targetEdge.dy)
      ..lineTo(
        targetEdge.dx - arrowSize * cos(angle - pi / 6),
        targetEdge.dy - arrowSize * sin(angle - pi / 6),
      )
      ..lineTo(
        targetEdge.dx - arrowSize * cos(angle + pi / 6),
        targetEdge.dy - arrowSize * sin(angle + pi / 6),
      )
      ..close();

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    canvas.drawPath(path, paint);
  }

  void _drawEdgeLabel(Canvas canvas, Offset center, String text, bool isAssociative) {
    if (text.trim().isEmpty) return;

    final textSpan = TextSpan(
      text: text,
      style: TextStyle(
        color: isAssociative ? const Color(0xFFE9D5FF) : const Color(0xFFBAE6FD),
        fontSize: 10,
        fontWeight: FontWeight.bold,
      ),
    );
    final textPainter = TextPainter(
      text: textSpan,
      textDirection: TextDirection.ltr,
    );
    textPainter.layout();

    final rect = Rect.fromCenter(
      center: center,
      width: textPainter.width + 12,
      height: textPainter.height + 6,
    );

    final bgPaint = Paint()
      ..color = const Color(0xFF0F172A).withValues(alpha: 0.92)
      ..style = PaintingStyle.fill;

    final borderPaint = Paint()
      ..color = isAssociative ? const Color(0xFF9333EA) : const Color(0xFF0284C7)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;

    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(6));
    canvas.drawRRect(rrect, bgPaint);
    canvas.drawRRect(rrect, borderPaint);

    textPainter.paint(
      canvas,
      Offset(center.dx - textPainter.width / 2, center.dy - textPainter.height / 2),
    );
  }

  @override
  bool shouldRepaint(covariant DiagramCanvasPainter oldDelegate) {
    return oldDelegate.classes != classes || oldDelegate.edges != edges;
  }
}

