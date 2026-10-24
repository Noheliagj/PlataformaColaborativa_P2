import { RelationshipType, Visibility } from '@prisma/client';
import { DiagramForXmi } from '../projects/projects.service';
import { escapeXml } from './xml.util';

/**
 * RF12: genera un documento XMI 2.1 (perfil UML2, el mismo que exporta/
 * importa Enterprise Architect) a partir del diagrama relacional. Cubre el
 * subconjunto acordado en CONTEXT.md: clases, atributos, métodos,
 * asociaciones (con cardinalidad) y herencia — no paquetes, notas,
 * estereotipos ni información de diagramas (posiciones, colores).
 */

const XMI_NS = 'http://schema.omg.org/spec/XMI/2.1';
const UML_NS = 'http://schema.omg.org/spec/UML/2.1';
// Tipos primitivos como referencia href (no idref a un paquete de tipos
// propio): evita depender de un paquete de datatypes que este proyecto no
// modela, a costa de que el "tipo" viaje como el fragmento del href en vez
// de un id resoluble — ver xmi-parser.util.ts, que lo interpreta igual.
const PRIMITIVE_TYPES_HREF = 'http://schema.omg.org/spec/UML/2.1/uml.xml';

function visibilityToXmi(visibility: Visibility): string {
  switch (visibility) {
    case Visibility.PUBLIC:
      return 'public';
    case Visibility.PROTECTED:
      return 'protected';
    case Visibility.PACKAGE:
      return 'package';
    default:
      return 'private';
  }
}

function typeRef(typeName: string, indent: string): string {
  const name = (typeName || 'String').trim() || 'String';
  return `${indent}<type xmi:type="uml:PrimitiveType" href="${PRIMITIVE_TYPES_HREF}#${escapeXml(name)}"/>`;
}

interface Parameter {
  name: string;
  type: string;
}

/** "id: Long, nombre: String" -> [{name:'id',type:'Long'}, ...] (mismo formato que usa el resto de la app). */
function parseParameters(raw: string): Parameter[] {
  return (raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [name, type] = part.split(':');
      return {
        name: (name ?? '').trim() || 'param',
        type: (type ?? '').trim() || 'String',
      };
    });
}

interface Bounds {
  lower: string;
  upper: string;
}

/** "1" | "0..1" | "N" | "0..*" | "*" -> límites inferior/superior de multiplicidad UML. */
function cardinalityToBounds(cardinality: string | null): Bounds {
  const raw = (cardinality ?? '').trim();
  if (!raw) return { lower: '1', upper: '1' };
  if (raw.includes('..')) {
    const [lowerRaw, upperRaw] = raw.split('..').map((part) => part.trim());
    return {
      lower: normalizeBound(lowerRaw, '0'),
      upper: normalizeBound(upperRaw, '*'),
    };
  }
  const bound = normalizeBound(raw, '1');
  return { lower: bound === '*' ? '0' : bound, upper: bound };
}

function normalizeBound(value: string, fallback: string): string {
  if (!value) return fallback;
  if (value === '*' || value.toUpperCase() === 'N') return '*';
  return /^\d+$/.test(value) ? value : fallback;
}

export function buildXmi(diagram: DiagramForXmi): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<xmi:XMI xmi:version="2.1" xmlns:xmi="${XMI_NS}" xmlns:uml="${UML_NS}">`);
  lines.push(
    `  <uml:Model xmi:type="uml:Model" xmi:id="model_root" name="${escapeXml(diagram.projectName || 'Proyecto')}">`,
  );

  for (const cls of diagram.classes) {
    const classId = `cls_${cls.id}`;
    const xmiType = cls.isAssociative ? 'uml:AssociationClass' : 'uml:Class';
    lines.push(`    <packagedElement xmi:type="${xmiType}" xmi:id="${classId}" name="${escapeXml(cls.name)}">`);

    cls.attributes.forEach((attr, index) => {
      lines.push(
        `      <ownedAttribute xmi:id="attr_${cls.id}_${index}" name="${escapeXml(attr.name)}" visibility="${visibilityToXmi(attr.visibility)}">`,
      );
      lines.push(typeRef(attr.type, '        '));
      lines.push('      </ownedAttribute>');
    });

    cls.methods.forEach((method, index) => {
      lines.push(
        `      <ownedOperation xmi:id="op_${cls.id}_${index}" name="${escapeXml(method.name)}" visibility="${visibilityToXmi(method.visibility)}">`,
      );
      parseParameters(method.parameters).forEach((param, paramIndex) => {
        lines.push(
          `        <ownedParameter xmi:id="param_${cls.id}_${index}_${paramIndex}" name="${escapeXml(param.name)}" direction="in">`,
        );
        lines.push(typeRef(param.type, '          '));
        lines.push('        </ownedParameter>');
      });
      lines.push(
        `        <ownedParameter xmi:id="ret_${cls.id}_${index}" name="return" direction="return">`,
      );
      lines.push(typeRef(method.returnType, '          '));
      lines.push('        </ownedParameter>');
      lines.push('      </ownedOperation>');
    });

    // RF7: herencia como <generalization> hijo de la clase específica
    // (subclase), apuntando por id a la clase general — mismo lugar donde
    // Enterprise Architect la publica.
    for (const rel of diagram.relationships) {
      if (rel.type === RelationshipType.INHERITANCE && rel.sourceClassId === cls.id) {
        lines.push(
          `      <generalization xmi:type="uml:Generalization" xmi:id="gen_${rel.id}" general="cls_${rel.targetClassId}"/>`,
        );
      }
    }

    lines.push('    </packagedElement>');
  }

  for (const rel of diagram.relationships) {
    if (rel.type === RelationshipType.INHERITANCE) continue; // ya se emitió como <generalization> arriba

    if (rel.type === RelationshipType.REALIZATION || rel.type === RelationshipType.DEPENDENCY) {
      // RF7: sin extremos/multiplicidad -- son relaciones cliente/proveedor
      // simples entre dos clases (este proyecto no modela interfaces UML).
      const xmiType = rel.type === RelationshipType.REALIZATION ? 'uml:Realization' : 'uml:Dependency';
      const depId = `dep_${rel.id}`;
      lines.push(
        `    <packagedElement xmi:type="${xmiType}" xmi:id="${depId}" client="cls_${rel.sourceClassId}" supplier="cls_${rel.targetClassId}"${
          rel.name ? ` name="${escapeXml(rel.name)}"` : ''
        }/>`,
      );
      continue;
    }

    const sourceBounds = cardinalityToBounds(rel.sourceCardinality);
    const targetBounds = cardinalityToBounds(rel.targetCardinality);
    const assocId = `assoc_${rel.id}`;

    // RF7: en el editor el romb se dibuja sobre el extremo ORIGEN (la clase
    // "todo"); en UML/XMI el atributo `aggregation` va en cambio en el
    // extremo DESTINO (la "parte") -- ver xmi-parser.util.ts al importar.
    const targetAggregation =
      rel.type === RelationshipType.COMPOSITION
        ? 'composite'
        : rel.type === RelationshipType.AGGREGATION
          ? 'shared'
          : 'none';

    lines.push(
      `    <packagedElement xmi:type="uml:Association" xmi:id="${assocId}" memberEnd="${assocId}_end1 ${assocId}_end2"${
        rel.name ? ` name="${escapeXml(rel.name)}"` : ''
      }>`,
    );
    lines.push(`      <ownedEnd xmi:id="${assocId}_end1" association="${assocId}" aggregation="none">`);
    lines.push(`        <type xmi:idref="cls_${rel.sourceClassId}"/>`);
    lines.push(`        <lowerValue xmi:type="uml:LiteralInteger" value="${sourceBounds.lower}"/>`);
    lines.push(`        <upperValue xmi:type="uml:LiteralUnlimitedNatural" value="${sourceBounds.upper}"/>`);
    lines.push('      </ownedEnd>');
    lines.push(`      <ownedEnd xmi:id="${assocId}_end2" association="${assocId}" aggregation="${targetAggregation}">`);
    lines.push(`        <type xmi:idref="cls_${rel.targetClassId}"/>`);
    lines.push(`        <lowerValue xmi:type="uml:LiteralInteger" value="${targetBounds.lower}"/>`);
    lines.push(`        <upperValue xmi:type="uml:LiteralUnlimitedNatural" value="${targetBounds.upper}"/>`);
    lines.push('      </ownedEnd>');
    lines.push('    </packagedElement>');
  }

  lines.push('  </uml:Model>');
  lines.push('</xmi:XMI>');
  return lines.join('\n');
}
