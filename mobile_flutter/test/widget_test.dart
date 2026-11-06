import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_flutter/main.dart';

void main() {
  testWidgets('UmlViewerApp smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const UmlViewerApp());
    expect(find.text('Visor UML Móvil'), findsOneWidget);
  });
}
