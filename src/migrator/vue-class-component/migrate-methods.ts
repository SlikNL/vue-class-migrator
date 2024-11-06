import {
  ClassDeclaration,
  MethodDeclaration,
  ObjectLiteralExpression,
  OptionalKind,
  ParameterDeclarationStructure,
} from 'ts-morph';
import { getObjectProperty } from '../utils';
import { lifecycleHooks } from '../config';

/**
 * Map to method parameters from `MethodDeclaration` instance
 */
function toMethodParameters(
  methodDeclaration: MethodDeclaration,
): OptionalKind<ParameterDeclarationStructure>[] | undefined {
  return methodDeclaration.getParameters().map((p) => p.getStructure());
}

/**
 * Add Vue special methods to the main object
 */
function appendVueSpecialMethods(
  classDeclaration: ClassDeclaration,
  mainObject: ObjectLiteralExpression,
): void {
  lifecycleHooks
    .filter((m) => classDeclaration.getMethod(m))
    .forEach((m) => {
      const method = classDeclaration.getMethodOrThrow(m);
      const typeNode = method.getReturnTypeNode()?.getText();
      mainObject.addMethod({
        name: method.getName(),
        isAsync: method.isAsync(),
        returnType: typeNode,
        statements: method.getBodyText(),
        // In case of Nuxt lifecycle hooks, need to pass parameters
        parameters: toMethodParameters(method),
      });
    });
}

/**
 * Append methods to main object except Vue special methods
 */
function appendMethods(methods: MethodDeclaration[], mainObject: ObjectLiteralExpression): void {
  const methodsObject = getObjectProperty(mainObject, 'methods');

  methods.forEach((method) => {
    if (method.getDecorators().length) {
      throw new Error(`The method ${method.getName()} has non supported decorators.`);
    }

    const typeNode = method.getReturnTypeNode()?.getText();
    methodsObject.addMethod({
      name: method.getName(),
      parameters: toMethodParameters(method),
      isAsync: method.isAsync(),
      returnType: typeNode,
      statements: method.getBodyText(),
    });
  });
}

export default (clazz: ClassDeclaration, mainObject: ObjectLiteralExpression) => {
  appendVueSpecialMethods(clazz, mainObject);

  const methods = clazz
    .getMethods()
    .filter(
      (m) => !lifecycleHooks.includes(m.getName())
        && !['data'].includes(m.getName())
        && !m.getDecorator('Watch'),
    );

  if (!methods.length) {
    return;
  }

  appendMethods(methods, mainObject);
};
