/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {noop} from '../../../compiler/src/render3/view/util';
import {Component as _Component} from '../../src/core';
import {defineComponent} from '../../src/render3/definition';
import {getTranslationForTemplate, i18n, i18nApply, i18nAttributes, i18nEnd, i18nExp, i18nPostprocess, i18nStart} from '../../src/render3/i18n';
import {RenderFlags} from '../../src/render3/interfaces/definition';
import {getNativeByIndex} from '../../src/render3/util';

import {NgIf} from './common_with_def';

import {element, elementEnd, elementStart, template, text, nextContext, bind, elementProperty, projectionDef, projection, elementContainerStart, elementContainerEnd} from '../../src/render3/instructions';
import {COMMENT_MARKER, ELEMENT_MARKER, I18nMutateOpCode, I18nUpdateOpCode, I18nUpdateOpCodes, TI18n} from '../../src/render3/interfaces/i18n';
import {HEADER_OFFSET, LView, TVIEW} from '../../src/render3/interfaces/view';
import {ComponentFixture, TemplateFixture} from './render_util';

const Component: typeof _Component = function(...args: any[]): any {
  // In test we use @Component for documentation only so it's safe to mock out the implementation.
  return () => undefined;
} as any;

describe('Runtime i18n', () => {
  describe('getTranslationForTemplate', () => {
    it('should crop messages for the selected template', () => {
      let message = `simple text`;
      expect(getTranslationForTemplate(message)).toEqual(message);

      message = `Hello �0�!`;
      expect(getTranslationForTemplate(message)).toEqual(message);

      message = `Hello �#2��0��/#2�!`;
      expect(getTranslationForTemplate(message)).toEqual(message);

      // Embedded sub-templates
      message = `�0� is rendered as: �*2:1�before�*1:2�middle�/*1:2�after�/*2:1�!`;
      expect(getTranslationForTemplate(message)).toEqual('�0� is rendered as: �*2:1��/*2:1�!');
      expect(getTranslationForTemplate(message, 1)).toEqual('before�*1:2��/*1:2�after');
      expect(getTranslationForTemplate(message, 2)).toEqual('middle');

      // Embedded & sibling sub-templates
      message =
          `�0� is rendered as: �*2:1�before�*1:2�middle�/*1:2�after�/*2:1� and also �*4:3�before�*1:4�middle�/*1:4�after�/*4:3�!`;
      expect(getTranslationForTemplate(message))
          .toEqual('�0� is rendered as: �*2:1��/*2:1� and also �*4:3��/*4:3�!');
      expect(getTranslationForTemplate(message, 1)).toEqual('before�*1:2��/*1:2�after');
      expect(getTranslationForTemplate(message, 2)).toEqual('middle');
      expect(getTranslationForTemplate(message, 3)).toEqual('before�*1:4��/*1:4�after');
      expect(getTranslationForTemplate(message, 4)).toEqual('middle');
    });

    it('should throw if the template is malformed', () => {
      const message = `�*2:1�message!`;
      expect(() => getTranslationForTemplate(message)).toThrowError(/Tag mismatch/);
    });
  });

  function prepareFixture(
      createTemplate: () => void, updateTemplate: (() => void)|null, nbConsts = 0,
      nbVars = 0): TemplateFixture {
    return new TemplateFixture(createTemplate, updateTemplate || noop, nbConsts, nbVars);
  }

  function getOpCodes(
      createTemplate: () => void, updateTemplate: (() => void)|null, nbConsts: number,
      index: number): TI18n|I18nUpdateOpCodes {
    const fixture = prepareFixture(createTemplate, updateTemplate, nbConsts);
    const tView = fixture.hostView[TVIEW];
    return tView.data[index + HEADER_OFFSET] as TI18n;
  }

  describe('i18nStart', () => {
    it('for text', () => {
      const MSG_DIV = `simple text`;
      const nbConsts = 1;
      const index = 0;
      const opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV); }, null, nbConsts, index);

      expect(opCodes).toEqual({
        vars: 1,
        expandoStartIndex: nbConsts,
        create: [
          'simple text', nbConsts,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild
        ],
        update: [],
        icus: null
      });
    });

    it('for elements', () => {
      const MSG_DIV = `Hello �#2�world�/#2� and �#3�universe�/#3�!`;
      // Template: `<div>Hello <div>world</div> and <span>universe</span>!`
      // 3 consts for the 2 divs and 1 span + 1 const for `i18nStart` = 4 consts
      const nbConsts = 4;
      const index = 1;
      const elementIndex = 2;
      const elementIndex2 = 3;
      const opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV); }, null, nbConsts, index);

      expect(opCodes).toEqual({
        vars: 5,
        expandoStartIndex: nbConsts,
        create: [
          'Hello ',
          nbConsts,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          elementIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Select,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          'world',
          nbConsts + 1,
          elementIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          elementIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.ElementEnd,
          ' and ',
          nbConsts + 2,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          elementIndex2 << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Select,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          'universe',
          nbConsts + 3,
          elementIndex2 << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          elementIndex2 << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.ElementEnd,
          '!',
          nbConsts + 4,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
        ],
        update: [],
        icus: null
      });
    });

    it('for simple bindings', () => {
      const MSG_DIV = `Hello �0�!`;
      const nbConsts = 2;
      const index = 1;
      const opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV); }, null, nbConsts, index);

      expect(opCodes).toEqual({
        vars: 1,
        expandoStartIndex: nbConsts,
        create:
            ['', nbConsts, index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild],
        update: [
          0b1,  // bindings mask
          4,    // if no update, skip 4
          'Hello ',
          -1,  // binding index
          '!', (index + 1) << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Text
        ],
        icus: null
      });
    });

    it('for multiple bindings', () => {
      const MSG_DIV = `Hello �0� and �1�, again �0�!`;
      const nbConsts = 2;
      const index = 1;
      const opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV); }, null, nbConsts, index);

      expect(opCodes).toEqual({
        vars: 1,
        expandoStartIndex: nbConsts,
        create:
            ['', nbConsts, index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild],
        update: [
          0b11,  // bindings mask
          8,     // if no update, skip 8
          'Hello ', -1, ' and ', -2, ', again ', -1, '!',
          (index + 1) << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Text
        ],
        icus: null
      });
    });

    it('for sub-templates', () => {
      // Template:
      // <div>
      //   {{value}} is rendered as:
      //   <span *ngIf>
      //     before <b *ngIf>middle</b> after
      //   </span>
      //   !
      // </div>
      const MSG_DIV =
          `�0� is rendered as: �*2:1��#1:1�before�*2:2��#1:2�middle�/#1:2��/*2:2�after�/#1:1��/*2:1�!`;

      /**** Root template ****/
      // �0� is rendered as: �*2:1��/*2:1�!
      let nbConsts = 3;
      let index = 1;
      const firstTextNode = 3;
      let opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV); }, null, nbConsts, index);

      expect(opCodes).toEqual({
        vars: 2,
        expandoStartIndex: nbConsts,
        create: [
          '',
          nbConsts,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          2 << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Select,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          '!',
          nbConsts + 1,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
        ],
        update: [
          0b1,  //  bindings mask
          3,    // if no update, skip 3
          -1,   // binding index
          ' is rendered as: ', firstTextNode << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Text
        ],
        icus: null
      });


      /**** First sub-template ****/
      // �#1:1�before�*2:2�middle�/*2:2�after�/#1:1�
      nbConsts = 3;
      index = 0;
      const spanElement = 1;
      const bElementSubTemplate = 2;
      opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV, 1); }, null, nbConsts, index);

      expect(opCodes).toEqual({
        vars: 2,
        expandoStartIndex: nbConsts,
        create: [
          spanElement << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Select,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          'before',
          nbConsts,
          spanElement << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          bElementSubTemplate << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Select,
          spanElement << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          'after',
          nbConsts + 1,
          spanElement << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          spanElement << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.ElementEnd,
        ],
        update: [],
        icus: null
      });


      /**** Second sub-template ****/
      // middle
      nbConsts = 2;
      index = 0;
      const bElement = 1;
      opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV, 2); }, null, nbConsts, index);

      expect(opCodes).toEqual({
        vars: 1,
        expandoStartIndex: nbConsts,
        create: [
          bElement << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Select,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          'middle',
          nbConsts,
          bElement << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
          bElement << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.ElementEnd,
        ],
        update: [],
        icus: null
      });
    });

    it('for ICU expressions', () => {
      const MSG_DIV = `{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      }`;
      const nbConsts = 1;
      const index = 0;
      const opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV); }, null, nbConsts, index);
      const tIcuIndex = 0;
      const icuCommentNodeIndex = index + 1;
      const firstTextNodeIndex = index + 2;
      const bElementNodeIndex = index + 3;
      const iElementNodeIndex = index + 3;
      const spanElementNodeIndex = index + 3;
      const innerTextNode = index + 4;
      const lastTextNode = index + 5;

      expect(opCodes).toEqual({
        vars: 5,
        expandoStartIndex: nbConsts,
        create: [
          COMMENT_MARKER, 'ICU 1', icuCommentNodeIndex,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild
        ],
        update: [
          0b1,  // mask for ICU main binding
          3,    // skip 3 if not changed
          -1,   // icu main binding
          icuCommentNodeIndex << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.IcuSwitch, tIcuIndex,
          0b11,  // mask for all ICU bindings
          2,     // skip 2 if not changed
          icuCommentNodeIndex << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.IcuUpdate, tIcuIndex
        ],
        icus: [{
          type: 1,
          vars: [4, 3, 3],
          expandoStartIndex: icuCommentNodeIndex + 1,
          childIcus: [[], [], []],
          cases: ['0', '1', 'other'],
          create: [
            [
              'no ',
              firstTextNodeIndex,
              icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
              ELEMENT_MARKER,
              'b',
              bElementNodeIndex,
              icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
              bElementNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Attr,
              'title',
              'none',
              'emails',
              innerTextNode,
              bElementNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
              '!',
              lastTextNode,
              icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
            ],
            [
              'one ', firstTextNodeIndex,
              icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
              ELEMENT_MARKER, 'i', iElementNodeIndex,
              icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
              'email', innerTextNode,
              iElementNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild
            ],
            [
              '', firstTextNodeIndex,
              icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
              ELEMENT_MARKER, 'span', spanElementNodeIndex,
              icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
              'emails', innerTextNode,
              spanElementNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild
            ]
          ],
          remove: [
            [
              firstTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              innerTextNode << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              bElementNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              lastTextNode << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
            ],
            [
              firstTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              innerTextNode << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              iElementNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
            ],
            [
              firstTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              innerTextNode << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              spanElementNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
            ]
          ],
          update: [
            [], [],
            [
              0b1,  // mask for the first binding
              3,    // skip 3 if not changed
              -1,   // binding index
              ' ',  // text string to concatenate to the binding value
              firstTextNodeIndex << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Text,
              0b10,  // mask for the title attribute binding
              4,     // skip 4 if not changed
              -2,    // binding index
              bElementNodeIndex << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Attr,
              'title',  // attribute name
              null      // sanitize function
            ]
          ]
        }]
      });
    });

    it('for nested ICU expressions', () => {
      const MSG_DIV = `{�0�, plural,
        =0 {zero} 
        other {�0� {�1�, select, 
                       cat {cats} 
                       dog {dogs} 
                       other {animals}
                     }!}
      }`;
      const nbConsts = 1;
      const index = 0;
      const opCodes = getOpCodes(() => { i18nStart(index, MSG_DIV); }, null, nbConsts, index);
      const icuCommentNodeIndex = index + 1;
      const firstTextNodeIndex = index + 2;
      const nestedIcuCommentNodeIndex = index + 3;
      const lastTextNodeIndex = index + 4;
      const nestedTextNodeIndex = index + 5;
      const tIcuIndex = 1;
      const nestedTIcuIndex = 0;

      expect(opCodes).toEqual({
        vars: 6,
        expandoStartIndex: nbConsts,
        create: [
          COMMENT_MARKER, 'ICU 1', icuCommentNodeIndex,
          index << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild
        ],
        update: [
          0b1,  // mask for ICU main binding
          3,    // skip 3 if not changed
          -1,   // icu main binding
          icuCommentNodeIndex << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.IcuSwitch, tIcuIndex,
          0b11,  // mask for all ICU bindings
          2,     // skip 2 if not changed
          icuCommentNodeIndex << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.IcuUpdate, tIcuIndex
        ],
        icus: [
          {
            type: 0,
            vars: [1, 1, 1],
            expandoStartIndex: lastTextNodeIndex + 1,
            childIcus: [[], [], []],
            cases: ['cat', 'dog', 'other'],
            create: [
              [
                'cats', nestedTextNodeIndex, nestedIcuCommentNodeIndex
                        << I18nMutateOpCode.SHIFT_PARENT |
                    I18nMutateOpCode.AppendChild
              ],
              [
                'dogs', nestedTextNodeIndex, nestedIcuCommentNodeIndex
                        << I18nMutateOpCode.SHIFT_PARENT |
                    I18nMutateOpCode.AppendChild
              ],
              [
                'animals', nestedTextNodeIndex, nestedIcuCommentNodeIndex
                        << I18nMutateOpCode.SHIFT_PARENT |
                    I18nMutateOpCode.AppendChild
              ]
            ],
            remove: [
              [nestedTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove],
              [nestedTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove],
              [nestedTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove]
            ],
            update: [[], [], []]
          },
          {
            type: 1,
            vars: [1, 4],
            expandoStartIndex: icuCommentNodeIndex + 1,
            childIcus: [[], [0]],
            cases: ['0', 'other'],
            create: [
              [
                'zero', firstTextNodeIndex,
                icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild
              ],
              [
                '', firstTextNodeIndex,
                icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
                COMMENT_MARKER, 'nested ICU 0', nestedIcuCommentNodeIndex,
                icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild,
                '!', lastTextNodeIndex,
                icuCommentNodeIndex << I18nMutateOpCode.SHIFT_PARENT | I18nMutateOpCode.AppendChild
              ]
            ],
            remove: [
              [firstTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove],
              [
                firstTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
                lastTextNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
                0 << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.RemoveNestedIcu,
                nestedIcuCommentNodeIndex << I18nMutateOpCode.SHIFT_REF | I18nMutateOpCode.Remove,
              ]
            ],
            update: [
              [],
              [
                0b1,  // mask for ICU main binding
                3,    // skip 3 if not changed
                -1,   // binding index
                ' ',  // text string to concatenate to the binding value
                firstTextNodeIndex << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Text,
                0b10,  // mask for inner ICU main binding
                3,     // skip 3 if not changed
                -2,    // inner ICU main binding
                nestedIcuCommentNodeIndex << I18nUpdateOpCode.SHIFT_REF |
                    I18nUpdateOpCode.IcuSwitch,
                nestedTIcuIndex,
                0b10,  // mask for all inner ICU bindings
                2,     // skip 2 if not changed
                nestedIcuCommentNodeIndex << I18nUpdateOpCode.SHIFT_REF |
                    I18nUpdateOpCode.IcuUpdate,
                nestedTIcuIndex
              ]
            ]
          }
        ]
      });
    });
  });

  describe(`i18nEnd`, () => {
    it('for text', () => {
      const MSG_DIV = `simple text`;
      const fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18n(1, MSG_DIV);
        elementEnd();
      }, null, 2);

      expect(fixture.html).toEqual(`<div>${MSG_DIV}</div>`);
    });

    it('for bindings', () => {
      const MSG_DIV = `Hello �0�!`;
      const fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18n(1, MSG_DIV);
        elementEnd();
      }, null, 2);

      // Template should be empty because there is no update template function
      expect(fixture.html).toEqual('<div></div>');

      // But it should have created an empty text node in `viewData`
      const textTNode = fixture.hostView[HEADER_OFFSET + 2] as Node;
      expect(textTNode.nodeType).toEqual(Node.TEXT_NODE);
    });

    it('for elements', () => {
      const MSG_DIV = `Hello �#3�world�/#3� and �#2�universe�/#2�!`;
      let fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18nStart(1, MSG_DIV);
        element(2, 'div');
        element(3, 'span');
        i18nEnd();
        elementEnd();
      }, null, 4);

      expect(fixture.html).toEqual('<div>Hello <span>world</span> and <div>universe</div>!</div>');
    });

    it('for translations without top level element', () => {
      // When it's the first node
      let MSG_DIV = `Hello world`;
      let fixture = prepareFixture(() => { i18n(0, MSG_DIV); }, null, 1);

      expect(fixture.html).toEqual('Hello world');

      // When the first node is a text node
      MSG_DIV = ` world`;
      fixture = prepareFixture(() => {
        text(0, 'Hello');
        i18n(1, MSG_DIV);
      }, null, 2);

      expect(fixture.html).toEqual('Hello world');

      // When the first node is an element
      fixture = prepareFixture(() => {
        elementStart(0, 'div');
        text(1, 'Hello');
        elementEnd();
        i18n(2, MSG_DIV);
      }, null, 3);

      expect(fixture.html).toEqual('<div>Hello</div> world');

      // When there is a node after
      MSG_DIV = `Hello `;
      fixture = prepareFixture(() => {
        i18n(0, MSG_DIV);
        text(1, 'world');
      }, null, 2);

      expect(fixture.html).toEqual('Hello world');
    });

    it('for deleted placeholders', () => {
      const MSG_DIV = `Hello �#3�world�/#3�`;
      let fixture = prepareFixture(() => {
        elementStart(0, 'div');
        {
          i18nStart(1, MSG_DIV);
          {
            element(2, 'div');  // Will be removed
            element(3, 'span');
          }
          i18nEnd();
        }
        elementEnd();
        elementStart(4, 'div');
        { text(5, '!'); }
        elementEnd();
      }, null, 6);

      expect(fixture.html).toEqual('<div>Hello <span>world</span></div><div>!</div>');
    });

    it('for sub-templates', () => {
      // Template: `<div>Content: <div>before<span>middle</span>after</div>!</div>`;
      const MSG_DIV =
          `Content: �*2:1��#1:1�before�*2:2��#1:2�middle�/#1:2��/*2:2�after�/#1:1��/*2:1�!`;

      function subTemplate_1(rf: RenderFlags, ctx: any) {
        if (rf & RenderFlags.Create) {
          i18nStart(0, MSG_DIV, 1);
          elementStart(1, 'div');
          template(2, subTemplate_2, 2, 0, 'span', ['ngIf', '']);
          elementEnd();
          i18nEnd();
        }
        if (rf & RenderFlags.Update) {
          elementProperty(2, 'ngIf', bind(true));
        }
      }

      function subTemplate_2(rf: RenderFlags, ctx: any) {
        if (rf & RenderFlags.Create) {
          i18nStart(0, MSG_DIV, 2);
          element(1, 'span');
          i18nEnd();
        }
      }

      class MyApp {
        static ngComponentDef = defineComponent({
          type: MyApp,
          selectors: [['my-app']],
          directives: [NgIf],
          factory: () => new MyApp(),
          consts: 3,
          vars: 1,
          template: (rf: RenderFlags, ctx: MyApp) => {
            if (rf & RenderFlags.Create) {
              elementStart(0, 'div');
              i18nStart(1, MSG_DIV);
              template(2, subTemplate_1, 3, 1, 'div', ['ngIf', '']);
              i18nEnd();
              elementEnd();
            }
            if (rf & RenderFlags.Update) {
              elementProperty(2, 'ngIf', true);
            }
          }
        });
      }

      const fixture = new ComponentFixture(MyApp);
      expect(fixture.html)
          .toEqual('<div>Content: <div>before<span>middle</span>after</div>!</div>');
    });

    it('for ICU expressions', () => {
      const MSG_DIV = `{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      }`;
      const fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18n(1, MSG_DIV);
        elementEnd();
      }, null, 2);

      // Template should be empty because there is no update template function
      expect(fixture.html).toEqual('<div><!--ICU 2--></div>');
    });

    it('for multiple ICU expressions', () => {
      const MSG_DIV = `{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      } - {�0�, select, 
        other {(�0�)}
      }`;
      const fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18n(1, MSG_DIV);
        elementEnd();
      }, null, 2);

      // Template should be empty because there is no update template function
      expect(fixture.html).toEqual('<div><!--ICU 2--> - <!--ICU 8--></div>');
    });

    it('for multiple ICU expressions inside html', () => {
      const MSG_DIV = `�#2�{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      }�/#2��#3�{�0�, select, 
        other {(�0�)}
      }�/#3�`;
      const fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18nStart(1, MSG_DIV);
        element(2, 'span');
        element(3, 'span');
        i18nEnd();
        elementEnd();
      }, null, 4);

      // Template should be empty because there is no update template function
      expect(fixture.html).toEqual('<div><span><!--ICU 4--></span><span><!--ICU 9--></span></div>');
    });

    it('for ICU expressions inside templates', () => {
      const MSG_DIV = `�*2:1��#1:1�{�0:1�, plural,
        =0 {no <b title="none">emails</b>!}
        =1 {one <i>email</i>}
        other {�0:1� <span title="�1:1�">emails</span>}
      }�/#1:1��/*2:1�`;

      function subTemplate_1(rf: RenderFlags, ctx: any) {
        if (rf & RenderFlags.Create) {
          i18nStart(0, MSG_DIV, 1);
          element(1, 'span');
          i18nEnd();
        }
        if (rf & RenderFlags.Update) {
          const ctx = nextContext();
          i18nExp(bind(ctx.value0));
          i18nExp(bind(ctx.value1));
          i18nApply(0);
        }
      }

      class MyApp {
        value0 = 0;
        value1 = 'emails label';

        static ngComponentDef = defineComponent({
          type: MyApp,
          selectors: [['my-app']],
          directives: [NgIf],
          factory: () => new MyApp(),
          consts: 3,
          vars: 1,
          template: (rf: RenderFlags, ctx: MyApp) => {
            if (rf & RenderFlags.Create) {
              elementStart(0, 'div');
              i18nStart(1, MSG_DIV);
              template(2, subTemplate_1, 2, 2, 'span', [3, 'ngIf']);
              i18nEnd();
              elementEnd();
            }
            if (rf & RenderFlags.Update) {
              elementProperty(2, 'ngIf', true);
            }
          }
        });
      }

      const fixture = new ComponentFixture(MyApp);
      expect(fixture.html)
          .toEqual('<div><span>no <b title="none">emails</b>!<!--ICU 4--></span></div>');

      // Update the value
      fixture.component.value0 = 3;
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div><span>3 <span title="emails label">emails</span><!--ICU 4--></span></div>');
    });

    it('for ICU expressions inside <ng-container>', () => {
      const MSG_DIV = `{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      }`;
      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            {
              elementContainerStart(1);
              { i18n(2, MSG_DIV); }
              elementContainerEnd();
            }
            elementEnd();
          },
          () => {
            i18nExp(bind(0));
            i18nExp(bind('more than one'));
            i18nApply(2);
          },
          3, 2);

      expect(fixture.html).toEqual('<div>no <b title="none">emails</b>!<!--ICU 5--></div>');
    });

    it('for nested ICU expressions', () => {
      const MSG_DIV = `{�0�, plural,
        =0 {zero} 
        other {�0� {�1�, select, 
                       cat {cats} 
                       dog {dogs} 
                       other {animals}
                     }!}
      }`;
      const fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18n(1, MSG_DIV);
        elementEnd();
      }, null, 2);

      // Template should be empty because there is no update template function
      expect(fixture.html).toEqual('<div><!--ICU 2--></div>');
    });
  });

  describe(`i18nAttribute`, () => {
    it('for text', () => {
      const MSG_title = `Hello world!`;
      const MSG_div_attr = ['title', MSG_title];
      const nbConsts = 2;
      const index = 1;
      const fixture = prepareFixture(() => {
        elementStart(0, 'div');
        i18nAttributes(index, MSG_div_attr);
        elementEnd();
      }, null, nbConsts, index);
      const tView = fixture.hostView[TVIEW];
      const opCodes = tView.data[index + HEADER_OFFSET] as I18nUpdateOpCodes;

      expect(opCodes).toEqual([]);
      expect(
          (getNativeByIndex(0, fixture.hostView as LView) as any as Element).getAttribute('title'))
          .toEqual(MSG_title);
    });

    it('for simple bindings', () => {
      const MSG_title = `Hello �0�!`;
      const MSG_div_attr = ['title', MSG_title];
      const nbConsts = 2;
      const index = 1;
      const opCodes =
          getOpCodes(() => { i18nAttributes(index, MSG_div_attr); }, null, nbConsts, index);

      expect(opCodes).toEqual([
        0b1,  // bindings mask
        6,    // if no update, skip 4
        'Hello ',
        -1,  // binding index
        '!', (index - 1) << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Attr, 'title', null
      ]);
    });

    it('for multiple bindings', () => {
      const MSG_title = `Hello �0� and �1�, again �0�!`;
      const MSG_div_attr = ['title', MSG_title];
      const nbConsts = 2;
      const index = 1;
      const opCodes =
          getOpCodes(() => { i18nAttributes(index, MSG_div_attr); }, null, nbConsts, index);

      expect(opCodes).toEqual([
        0b11,  // bindings mask
        10,    // size
        'Hello ', -1, ' and ', -2, ', again ', -1, '!',
        (index - 1) << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Attr, 'title', null
      ]);
    });

    it('for multiple attributes', () => {
      const MSG_title = `Hello �0�!`;
      const MSG_div_attr = ['title', MSG_title, 'aria-label', MSG_title];
      const nbConsts = 2;
      const index = 1;
      const opCodes =
          getOpCodes(() => { i18nAttributes(index, MSG_div_attr); }, null, nbConsts, index);

      expect(opCodes).toEqual([
        0b1,  // bindings mask
        6,    // if no update, skip 4
        'Hello ',
        -1,  // binding index
        '!', (index - 1) << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Attr, 'title', null,
        0b1,  // bindings mask
        6,    // if no update, skip 4
        'Hello ',
        -1,  // binding index
        '!', (index - 1) << I18nUpdateOpCode.SHIFT_REF | I18nUpdateOpCode.Attr, 'aria-label', null
      ]);
    });
  });

  describe(`i18nExp & i18nApply`, () => {
    it('for text bindings', () => {
      const MSG_DIV = `Hello �0�!`;
      const ctx = {value: 'world'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18n(1, MSG_DIV);
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value));
            i18nApply(1);
          },
          2, 1);

      // Template should be empty because there is no update template function
      expect(fixture.html).toEqual('<div>Hello world!</div>');
    });

    it('for attribute bindings', () => {
      const MSG_title = `Hello �0�!`;
      const MSG_div_attr = ['title', MSG_title];
      const ctx = {value: 'world'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18nAttributes(1, MSG_div_attr);
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value));
            i18nApply(1);
          },
          2, 1);

      expect(fixture.html).toEqual('<div title="Hello world!"></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html).toEqual('<div title="Hello world!"></div>');

      ctx.value = 'universe';
      fixture.update();
      expect(fixture.html).toEqual('<div title="Hello universe!"></div>');
    });

    it('for attributes with no bindings', () => {
      const MSG_title = `Hello world!`;
      const MSG_div_attr = ['title', MSG_title];

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18nAttributes(1, MSG_div_attr);
            elementEnd();
          },
          () => { i18nApply(1); }, 2, 1);

      expect(fixture.html).toEqual('<div title="Hello world!"></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html).toEqual('<div title="Hello world!"></div>');
    });

    it('for multiple attribute bindings', () => {
      const MSG_title = `Hello �0� and �1�, again �0�!`;
      const MSG_div_attr = ['title', MSG_title];
      const ctx = {value0: 'world', value1: 'universe'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18nAttributes(1, MSG_div_attr);
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value0));
            i18nExp(bind(ctx.value1));
            i18nApply(1);
          },
          2, 2);

      expect(fixture.html).toEqual('<div title="Hello world and universe, again world!"></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html).toEqual('<div title="Hello world and universe, again world!"></div>');

      ctx.value0 = 'earth';
      fixture.update();
      expect(fixture.html).toEqual('<div title="Hello earth and universe, again earth!"></div>');

      ctx.value0 = 'earthlings';
      ctx.value1 = 'martians';
      fixture.update();
      expect(fixture.html)
          .toEqual('<div title="Hello earthlings and martians, again earthlings!"></div>');
    });

    it('for bindings of multiple attributes', () => {
      const MSG_title = `Hello �0�!`;
      const MSG_div_attr = ['title', MSG_title, 'aria-label', MSG_title];
      const ctx = {value: 'world'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18nAttributes(1, MSG_div_attr);
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value));
            i18nApply(1);
          },
          2, 1);

      expect(fixture.html).toEqual('<div aria-label="Hello world!" title="Hello world!"></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html).toEqual('<div aria-label="Hello world!" title="Hello world!"></div>');

      ctx.value = 'universe';
      fixture.update();
      expect(fixture.html)
          .toEqual('<div aria-label="Hello universe!" title="Hello universe!"></div>');
    });

    it('for ICU expressions', () => {
      const MSG_DIV = `{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      }`;
      const ctx = {value0: 0, value1: 'emails label'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18n(1, MSG_DIV);
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value0));
            i18nExp(bind(ctx.value1));
            i18nApply(1);
          },
          2, 2);
      expect(fixture.html).toEqual('<div>no <b title="none">emails</b>!<!--ICU 4--></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html).toEqual('<div>no <b title="none">emails</b>!<!--ICU 4--></div>');

      ctx.value0 = 1;
      fixture.update();
      expect(fixture.html).toEqual('<div>one <i>email</i><!--ICU 4--></div>');

      ctx.value0 = 10;
      fixture.update();
      expect(fixture.html)
          .toEqual('<div>10 <span title="emails label">emails</span><!--ICU 4--></div>');

      ctx.value1 = '10 emails';
      fixture.update();
      expect(fixture.html)
          .toEqual('<div>10 <span title="10 emails">emails</span><!--ICU 4--></div>');

      ctx.value0 = 0;
      fixture.update();
      expect(fixture.html).toEqual('<div>no <b title="none">emails</b>!<!--ICU 4--></div>');
    });

    it('for multiple ICU expressions', () => {
      const MSG_DIV = `{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      } - {�0�, select, 
        other {(�0�)}
      }`;
      const ctx = {value0: 0, value1: 'emails label'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18n(1, MSG_DIV);
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value0));
            i18nExp(bind(ctx.value1));
            i18nApply(1);
          },
          2, 2);
      expect(fixture.html)
          .toEqual('<div>no <b title="none">emails</b>!<!--ICU 4--> - (0)<!--ICU 10--></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html)
          .toEqual('<div>no <b title="none">emails</b>!<!--ICU 4--> - (0)<!--ICU 10--></div>');

      ctx.value0 = 1;
      fixture.update();
      expect(fixture.html).toEqual('<div>one <i>email</i><!--ICU 4--> - (1)<!--ICU 10--></div>');

      ctx.value0 = 10;
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div>10 <span title="emails label">emails</span><!--ICU 4--> - (10)<!--ICU 10--></div>');

      ctx.value1 = '10 emails';
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div>10 <span title="10 emails">emails</span><!--ICU 4--> - (10)<!--ICU 10--></div>');

      ctx.value0 = 0;
      fixture.update();
      expect(fixture.html)
          .toEqual('<div>no <b title="none">emails</b>!<!--ICU 4--> - (0)<!--ICU 10--></div>');
    });

    it('for multiple ICU expressions', () => {
      const MSG_DIV = `�#2�{�0�, plural, 
        =0 {no <b title="none">emails</b>!} 
        =1 {one <i>email</i>} 
        other {�0� <span title="�1�">emails</span>}
      }�/#2��#3�{�0�, select, 
        other {(�0�)}
      }�/#3�`;
      const ctx = {value0: 0, value1: 'emails label'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18nStart(1, MSG_DIV);
            element(2, 'span');
            element(3, 'span');
            i18nEnd();
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value0));
            i18nExp(bind(ctx.value1));
            i18nApply(1);
          },
          4, 2);
      expect(fixture.html)
          .toEqual(
              '<div><span>no <b title="none">emails</b>!<!--ICU 6--></span><span>(0)<!--ICU 11--></span></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div><span>no <b title="none">emails</b>!<!--ICU 6--></span><span>(0)<!--ICU 11--></span></div>');

      ctx.value0 = 1;
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div><span>one <i>email</i><!--ICU 6--></span><span>(1)<!--ICU 11--></span></div>');

      ctx.value0 = 10;
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div><span>10 <span title="emails label">emails</span><!--ICU 6--></span><span>(10)<!--ICU 11--></span></div>');

      ctx.value1 = '10 emails';
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div><span>10 <span title="10 emails">emails</span><!--ICU 6--></span><span>(10)<!--ICU 11--></span></div>');

      ctx.value0 = 0;
      fixture.update();
      expect(fixture.html)
          .toEqual(
              '<div><span>no <b title="none">emails</b>!<!--ICU 6--></span><span>(0)<!--ICU 11--></span></div>');
    });

    it('for nested ICU expressions', () => {
      const MSG_DIV = `{�0�, plural,
        =0 {zero} 
        other {�0� {�1�, select, 
                       cat {cats} 
                       dog {dogs} 
                       other {animals}
                     }!}
      }`;
      const ctx = {value0: 0, value1: 'cat'};

      const fixture = prepareFixture(
          () => {
            elementStart(0, 'div');
            i18n(1, MSG_DIV);
            elementEnd();
          },
          () => {
            i18nExp(bind(ctx.value0));
            i18nExp(bind(ctx.value1));
            i18nApply(1);
          },
          2, 2);

      expect(fixture.html).toEqual('<div>zero<!--ICU 4--></div>');

      // Change detection cycle, no model changes
      fixture.update();
      expect(fixture.html).toEqual('<div>zero<!--ICU 4--></div>');

      ctx.value0 = 10;
      fixture.update();
      expect(fixture.html).toEqual('<div>10 cats<!--nested ICU 0-->!<!--ICU 4--></div>');

      ctx.value1 = 'squirrel';
      fixture.update();
      expect(fixture.html).toEqual('<div>10 animals<!--nested ICU 0-->!<!--ICU 4--></div>');

      ctx.value0 = 0;
      fixture.update();
      expect(fixture.html).toEqual('<div>zero<!--ICU 4--></div>');
    });
  });

  describe('integration', () => {
    it('should support multiple i18n blocks', () => {
      // Translated template:
      // <div>
      //  <a i18n>
      //    trad {{exp1}}
      //  </a>
      //  hello
      //  <b i18n i18n-title title="start {{exp2}} middle {{exp1}} end">
      //    <e></e>
      //    <c>trad</c>
      //  </b>
      // </div>

      const MSG_DIV_1 = `trad �0�`;
      const MSG_DIV_2_ATTR = ['title', `start �1� middle �0� end`];
      const MSG_DIV_2 = `�#9��/#9��#7�trad�/#7�`;

      class MyApp {
        exp1 = '1';
        exp2 = '2';

        static ngComponentDef = defineComponent({
          type: MyApp,
          selectors: [['my-app']],
          factory: () => new MyApp(),
          consts: 10,
          vars: 2,
          template: (rf: RenderFlags, ctx: MyApp) => {
            if (rf & RenderFlags.Create) {
              elementStart(0, 'div');
              {
                elementStart(1, 'a');
                { i18n(2, MSG_DIV_1); }
                elementEnd();
                text(3, 'hello');
                elementStart(4, 'b');
                {
                  i18nAttributes(5, MSG_DIV_2_ATTR);
                  i18nStart(6, MSG_DIV_2);
                  {
                    element(7, 'c');
                    element(8, 'd');  // will be removed
                    element(9, 'e');  // will be moved before `c`
                  }
                  i18nEnd();
                }
                elementEnd();
              }
              elementEnd();
            }
            if (rf & RenderFlags.Update) {
              i18nExp(bind(ctx.exp1));
              i18nApply(2);
              i18nExp(bind(ctx.exp1));
              i18nExp(bind(ctx.exp2));
              i18nApply(5);
            }
          }
        });
      }

      const fixture = new ComponentFixture(MyApp);
      expect(fixture.html)
          .toEqual(
              `<div><a>trad 1</a>hello<b title="start 2 middle 1 end"><e></e><c>trad</c></b></div>`);
    });

    it('should support attribute translations on removed elements', () => {
      // Translated template:
      // <div i18n i18n-title title="start {{exp2}} middle {{exp1}} end">
      //    trad {{exp1}}
      // </div>

      const MSG_DIV_1 = `trad �0�`;
      const MSG_DIV_1_ATTR_1 = ['title', `start �1� middle �0� end`];

      class MyApp {
        exp1 = '1';
        exp2 = '2';

        static ngComponentDef = defineComponent({
          type: MyApp,
          selectors: [['my-app']],
          factory: () => new MyApp(),
          consts: 5,
          vars: 5,
          template: (rf: RenderFlags, ctx: MyApp) => {
            if (rf & RenderFlags.Create) {
              elementStart(0, 'div');
              {
                i18nAttributes(1, MSG_DIV_1_ATTR_1);
                i18nStart(2, MSG_DIV_1);
                {
                  elementStart(3, 'b');  // Will be removed
                  { i18nAttributes(4, MSG_DIV_1_ATTR_1); }
                  elementEnd();
                }
                i18nEnd();
              }
              elementEnd();
            }
            if (rf & RenderFlags.Update) {
              i18nExp(bind(ctx.exp1));
              i18nExp(bind(ctx.exp2));
              i18nApply(1);
              i18nExp(bind(ctx.exp1));
              i18nApply(2);
              i18nExp(bind(ctx.exp1));
              i18nExp(bind(ctx.exp2));
              i18nApply(4);
            }
          }
        });
      }

      const fixture = new ComponentFixture(MyApp);
      expect(fixture.html).toEqual(`<div title="start 2 middle 1 end">trad 1</div>`);
    });

    describe('projection', () => {
      it('should project the translations', () => {
        @Component({selector: 'child', template: '<p><ng-content></ng-content></p>'})
        class Child {
          static ngComponentDef = defineComponent({
            type: Child,
            selectors: [['child']],
            factory: () => new Child(),
            consts: 2,
            vars: 0,
            template: (rf: RenderFlags, cmp: Child) => {
              if (rf & RenderFlags.Create) {
                projectionDef();
                elementStart(0, 'p');
                { projection(1); }
                elementEnd();
              }
            }
          });
        }

        const MSG_DIV_SECTION_1 = `�#2�Je suis projeté depuis �#3��0��/#3��/#2�`;
        const MSG_ATTR_1 = ['title', `Enfant de �0�`];

        @Component({
          selector: 'parent',
          template: `
            <div i18n>
              <child>
                I am projected from
                <b i18n-title title="Child of {{name}}">{{name}}
                  <remove-me-1></remove-me-1>
                </b>
                <remove-me-2></remove-me-2>
              </child>
              <remove-me-3></remove-me-3>
            </div>`
          // Translated to:
          // <div i18n>
          //   <child>
          //     <p>
          //       Je suis projeté depuis <b i18n-title title="Enfant de {{name}}">{{name}}</b>
          //     </p>
          //   </child>
          // </div>
        })
        class Parent {
          name: string = 'Parent';
          static ngComponentDef = defineComponent({
            type: Parent,
            selectors: [['parent']],
            directives: [Child],
            factory: () => new Parent(),
            consts: 8,
            vars: 2,
            template: (rf: RenderFlags, cmp: Parent) => {
              if (rf & RenderFlags.Create) {
                elementStart(0, 'div');
                {
                  i18nStart(1, MSG_DIV_SECTION_1);
                  {
                    elementStart(2, 'child');
                    {
                      elementStart(3, 'b');
                      {
                        i18nAttributes(4, MSG_ATTR_1);
                        element(5, 'remove-me-1');
                      }
                      elementEnd();
                      element(6, 'remove-me-2');
                    }
                    elementEnd();
                    element(7, 'remove-me-3');
                  }
                  i18nEnd();
                }
                elementEnd();
              }
              if (rf & RenderFlags.Update) {
                i18nExp(bind(cmp.name));
                i18nApply(1);
                i18nExp(bind(cmp.name));
                i18nApply(4);
              }
            }
          });
        }

        const fixture = new ComponentFixture(Parent);
        expect(fixture.html)
            .toEqual(
                '<div><child><p>Je suis projeté depuis <b title="Enfant de Parent">Parent</b></p></child></div>');
        // <div><child><p><b title="Enfant de Parent">Parent</b></p></child></div>
        // <div><child><p>Je suis projeté depuis <b title="Enfant de
        // Parent">Parent</b></p></child></div>
      });

      it('should project a translated i18n block', () => {
        @Component({selector: 'child', template: '<p><ng-content></ng-content></p>'})
        class Child {
          static ngComponentDef = defineComponent({
            type: Child,
            selectors: [['child']],
            factory: () => new Child(),
            consts: 2,
            vars: 0,
            template: (rf: RenderFlags, cmp: Child) => {
              if (rf & RenderFlags.Create) {
                projectionDef();
                elementStart(0, 'p');
                { projection(1); }
                elementEnd();
              }
            }
          });
        }

        const MSG_DIV_SECTION_1 = `Je suis projeté depuis �0�`;
        const MSG_ATTR_1 = ['title', `Enfant de �0�`];

        @Component({
          selector: 'parent',
          template: `
        <div>
          <child>
            <any></any>
            <b i18n i18n-title title="Child of {{name}}">I am projected from {{name}}</b>
            <any></any>
          </child>
        </div>`
          // Translated to:
          // <div>
          //   <child>
          //     <any></any>
          //     <b i18n i18n-title title="Enfant de {{name}}">Je suis projeté depuis {{name}}</b>
          //     <any></any>
          //   </child>
          // </div>
        })
        class Parent {
          name: string = 'Parent';
          static ngComponentDef = defineComponent({
            type: Parent,
            selectors: [['parent']],
            directives: [Child],
            factory: () => new Parent(),
            consts: 7,
            vars: 2,
            template: (rf: RenderFlags, cmp: Parent) => {
              if (rf & RenderFlags.Create) {
                elementStart(0, 'div');
                {
                  elementStart(1, 'child');
                  {
                    element(2, 'any');
                    elementStart(3, 'b');
                    {
                      i18nAttributes(4, MSG_ATTR_1);
                      i18n(5, MSG_DIV_SECTION_1);
                    }
                    elementEnd();
                    element(6, 'any');
                  }
                  elementEnd();
                }
                elementEnd();
              }
              if (rf & RenderFlags.Update) {
                i18nExp(bind(cmp.name));
                i18nApply(4);
                i18nExp(bind(cmp.name));
                i18nApply(5);
              }
            }
          });
        }

        const fixture = new ComponentFixture(Parent);
        expect(fixture.html)
            .toEqual(
                '<div><child><p><any></any><b title="Enfant de Parent">Je suis projeté depuis Parent</b><any></any></p></child></div>');

        // it should be able to render a new component with the same template code
        const fixture2 = new ComponentFixture(Parent);
        expect(fixture2.html).toEqual(fixture.html);

        // Updating the fixture should work
        fixture2.component.name = 'Parent 2';
        fixture.update();
        fixture2.update();
        expect(fixture2.html)
            .toEqual(
                '<div><child><p><any></any><b title="Enfant de Parent 2">Je suis projeté depuis Parent 2</b><any></any></p></child></div>');

        // The first fixture should not have changed
        expect(fixture.html)
            .toEqual(
                '<div><child><p><any></any><b title="Enfant de Parent">Je suis projeté depuis Parent</b><any></any></p></child></div>');
      });

      it('should re-project translations when multiple projections', () => {
        @Component({selector: 'grand-child', template: '<div><ng-content></ng-content></div>'})
        class GrandChild {
          static ngComponentDef = defineComponent({
            type: GrandChild,
            selectors: [['grand-child']],
            factory: () => new GrandChild(),
            consts: 2,
            vars: 0,
            template: (rf: RenderFlags, cmp: Child) => {
              if (rf & RenderFlags.Create) {
                projectionDef();
                elementStart(0, 'div');
                { projection(1); }
                elementEnd();
              }
            }
          });
        }

        @Component(
            {selector: 'child', template: '<grand-child><ng-content></ng-content></grand-child>'})
        class Child {
          static ngComponentDef = defineComponent({
            type: Child,
            selectors: [['child']],
            directives: [GrandChild],
            factory: () => new Child(),
            consts: 2,
            vars: 0,
            template: (rf: RenderFlags, cmp: Child) => {
              if (rf & RenderFlags.Create) {
                projectionDef();
                elementStart(0, 'grand-child');
                { projection(1); }
                elementEnd();
              }
            }
          });
        }

        const MSG_DIV_SECTION_1 = `�#2�Bonjour�/#2� Monde!`;

        @Component({
          selector: 'parent',
          template: `<child i18n><b>Hello</b> World!</child>`
          // Translated to:
          // <child i18n><grand-child><div><b>Bonjour</b> Monde!</div></grand-child></child>
        })
        class Parent {
          name: string = 'Parent';
          static ngComponentDef = defineComponent({
            type: Parent,
            selectors: [['parent']],
            directives: [Child],
            factory: () => new Parent(),
            consts: 3,
            vars: 0,
            template: (rf: RenderFlags, cmp: Parent) => {
              if (rf & RenderFlags.Create) {
                elementStart(0, 'child');
                {
                  i18nStart(1, MSG_DIV_SECTION_1);
                  { element(2, 'b'); }
                  i18nEnd();
                }
                elementEnd();
              }
            }
          });
        }

        const fixture = new ComponentFixture(Parent);
        expect(fixture.html)
            .toEqual('<child><grand-child><div><b>Bonjour</b> Monde!</div></grand-child></child>');
        // <child><grand-child><div><b>Bonjour</b></div></grand-child></child>
        // <child><grand-child><div><b>Bonjour</b> Monde!</div></grand-child></child>
      });

      xit('should re-project translations when removed placeholders', () => {
        @Component({selector: 'grand-child', template: '<div><ng-content></ng-content></div>'})
        class GrandChild {
          static ngComponentDef = defineComponent({
            type: GrandChild,
            selectors: [['grand-child']],
            factory: () => new GrandChild(),
            consts: 3,
            vars: 0,
            template: (rf: RenderFlags, cmp: Child) => {
              if (rf & RenderFlags.Create) {
                projectionDef();
                elementStart(0, 'div');
                { projection(1); }
                elementEnd();
              }
            }
          });
        }

        @Component(
            {selector: 'child', template: '<grand-child><ng-content></ng-content></grand-child>'})
        class Child {
          static ngComponentDef = defineComponent({
            type: Child,
            selectors: [['child']],
            directives: [GrandChild],
            factory: () => new Child(),
            consts: 2,
            vars: 0,
            template: (rf: RenderFlags, cmp: Child) => {
              if (rf & RenderFlags.Create) {
                projectionDef();
                elementStart(0, 'grand-child');
                { projection(1); }
                elementEnd();
              }
            }
          });
        }

        const MSG_DIV_SECTION_1 = `Bonjour Monde!`;

        @Component({
          selector: 'parent',
          template: `<child i18n><b>Hello</b> World!</child>`
          // Translated to:
          // <child i18n><grand-child><div>Bonjour Monde!</div></grand-child></child>
        })
        class Parent {
          name: string = 'Parent';
          static ngComponentDef = defineComponent({
            type: Parent,
            selectors: [['parent']],
            directives: [Child],
            factory: () => new Parent(),
            consts: 2,
            vars: 0,
            template: (rf: RenderFlags, cmp: Parent) => {
              if (rf & RenderFlags.Create) {
                elementStart(0, 'child');
                {
                  i18nStart(1, MSG_DIV_SECTION_1);
                  {
                    element(2, 'b');  // will be removed
                  }
                  i18nEnd();
                }
                elementEnd();
              }
            }
          });
        }

        const fixture = new ComponentFixture(Parent);
        expect(fixture.html)
            .toEqual('<child><grand-child><div>Bonjour Monde!</div></grand-child></child>');
      });

      it('should project translations with selectors', () => {
        @Component({
          selector: 'child',
          template: `
          <ng-content select="span"></ng-content>
        `
        })
        class Child {
          static ngComponentDef = defineComponent({
            type: Child,
            selectors: [['child']],
            factory: () => new Child(),
            consts: 1,
            vars: 0,
            template: (rf: RenderFlags, cmp: Child) => {
              if (rf & RenderFlags.Create) {
                projectionDef([[['span']]], ['span']);
                projection(0, 1);
              }
            }
          });
        }

        const MSG_DIV_SECTION_1 = `�#2�Contenu�/#2�`;

        @Component({
          selector: 'parent',
          template: `
          <child i18n>
            <span title="keepMe"></span>
            <span title="deleteMe"></span>
          </child>
        `
          // Translated to:
          // <child i18n><span title="keepMe">Contenu</span></child>
        })
        class Parent {
          static ngComponentDef = defineComponent({
            type: Parent,
            selectors: [['parent']],
            directives: [Child],
            factory: () => new Parent(),
            consts: 4,
            vars: 0,
            template: (rf: RenderFlags, cmp: Parent) => {
              if (rf & RenderFlags.Create) {
                elementStart(0, 'child');
                {
                  i18nStart(1, MSG_DIV_SECTION_1);
                  {
                    element(2, 'span', ['title', 'keepMe']);
                    element(3, 'span', ['title', 'deleteMe']);
                  }
                  i18nEnd();
                }
                elementEnd();
              }
            }
          });
        }

        const fixture = new ComponentFixture(Parent);
        expect(fixture.html).toEqual('<child><span title="keepMe">Contenu</span></child>');
      });
    });
  });

  describe('i18nPostprocess', () => {
    it('should handle valid cases', () => {
      const arr = ['�*1:1��#2:1�', '�#4:1�', '�6:1�', '�/#2:1��/*1:1�'];
      const str = `[${arr.join('|')}]`;

      const cases = [
        // empty string
        ['', {}, ''],

        // string without any special cases
        ['Foo [1,2,3] Bar - no ICU here', {}, 'Foo [1,2,3] Bar - no ICU here'],

        // multi-value cases
        [
          `Start: ${str}, ${str} and ${str}, ${str} end.`, {},
          `Start: ${arr[0]}, ${arr[1]} and ${arr[2]}, ${arr[3]} end.`
        ],

        // replace VAR_SELECT
        [
          'My ICU: {VAR_SELECT, select, =1 {one} other {other}}', {VAR_SELECT: '�1:2�'},
          'My ICU: {�1:2�, select, =1 {one} other {other}}'
        ],

        [
          'My ICU: {\n\n\tVAR_SELECT_1 \n\n, select, =1 {one} other {other}}',
          {VAR_SELECT_1: '�1:2�'}, 'My ICU: {\n\n\t�1:2� \n\n, select, =1 {one} other {other}}'
        ],

        // replace VAR_PLURAL
        [
          'My ICU: {VAR_PLURAL, plural, one {1} other {other}}', {VAR_PLURAL: '�1:2�'},
          'My ICU: {�1:2�, plural, one {1} other {other}}'
        ],

        [
          'My ICU: {\n\n\tVAR_PLURAL_1 \n\n, select, =1 {one} other {other}}',
          {VAR_PLURAL_1: '�1:2�'}, 'My ICU: {\n\n\t�1:2� \n\n, select, =1 {one} other {other}}'
        ],

        // do not replace VAR_* anywhere else in a string (only in ICU)
        [
          'My ICU: {VAR_PLURAL, plural, one {1} other {other}} VAR_PLURAL and VAR_SELECT',
          {VAR_PLURAL: '�1:2�'},
          'My ICU: {�1:2�, plural, one {1} other {other}} VAR_PLURAL and VAR_SELECT'
        ],

        // replace VAR_*'s in nested ICUs
        [
          'My ICU: {VAR_PLURAL, plural, one {1 - {VAR_SELECT, age, 50 {fifty} other {other}}} other {other}}',
          {VAR_PLURAL: '�1:2�', VAR_SELECT: '�5�'},
          'My ICU: {�1:2�, plural, one {1 - {�5�, age, 50 {fifty} other {other}}} other {other}}'
        ],

        [
          'My ICU: {VAR_PLURAL, plural, one {1 - {VAR_PLURAL_1, age, 50 {fifty} other {other}}} other {other}}',
          {VAR_PLURAL: '�1:2�', VAR_PLURAL_1: '�5�'},
          'My ICU: {�1:2�, plural, one {1 - {�5�, age, 50 {fifty} other {other}}} other {other}}'
        ],

        // ICU replacement
        [
          'My ICU #1: �I18N_EXP_ICU�, My ICU #2: �I18N_EXP_ICU�',
          {ICU: ['ICU_VALUE_1', 'ICU_VALUE_2']}, 'My ICU #1: ICU_VALUE_1, My ICU #2: ICU_VALUE_2'
        ],

        // mixed case
        [
          `Start: ${str}, ${str}. ICU: {VAR_SELECT, count, 10 {ten} other {other}}.
          Another ICU: �I18N_EXP_ICU� and ${str}, ${str} and one more ICU: �I18N_EXP_ICU� and end.`,
          {VAR_SELECT: '�1:2�', ICU: ['ICU_VALUE_1', 'ICU_VALUE_2']},
          `Start: ${arr[0]}, ${arr[1]}. ICU: {�1:2�, count, 10 {ten} other {other}}.
          Another ICU: ICU_VALUE_1 and ${arr[2]}, ${arr[3]} and one more ICU: ICU_VALUE_2 and end.`,
        ],
      ];
      cases.forEach(([input, replacements, output]) => {
        expect(i18nPostprocess(input as string, replacements as any)).toEqual(output as string);
      });
    });

    it('should handle nested template represented by multi-value placeholders', () => {
      /**
       * <div i18n>
       *   <span>
       *     Hello - 1
       *   </span>
       *   <span *ngIf="visible">
       *     Hello - 2
       *     <span *ngIf="visible">
       *       Hello - 3
       *       <span *ngIf="visible">
       *         Hello - 4
       *       </span>
       *     </span>
       *   </span>
       *   <span>
       *     Hello - 5
       *   </span>
       * </div>
       */
      const generated = `
        [�#2�|�#4�] Bonjour - 1 [�/#2�|�/#1:3��/*2:3�|�/#1:2��/*2:2�|�/#1:1��/*3:1�|�/#4�]
        [�*3:1��#1:1�|�*2:2��#1:2�|�*2:3��#1:3�]
          Bonjour - 2
          [�*3:1��#1:1�|�*2:2��#1:2�|�*2:3��#1:3�]
            Bonjour - 3
            [�*3:1��#1:1�|�*2:2��#1:2�|�*2:3��#1:3�] Bonjour - 4 [�/#2�|�/#1:3��/*2:3�|�/#1:2��/*2:2�|�/#1:1��/*3:1�|�/#4�]
          [�/#2�|�/#1:3��/*2:3�|�/#1:2��/*2:2�|�/#1:1��/*3:1�|�/#4�]
        [�/#2�|�/#1:3��/*2:3�|�/#1:2��/*2:2�|�/#1:1��/*3:1�|�/#4�]
        [�#2�|�#4�] Bonjour - 5 [�/#2�|�/#1:3��/*2:3�|�/#1:2��/*2:2�|�/#1:1��/*3:1�|�/#4�]
      `;
      const final = `
        �#2� Bonjour - 1 �/#2�
        �*3:1�
          �#1:1�
            Bonjour - 2
            �*2:2�
              �#1:2�
                Bonjour - 3
                �*2:3�
                  �#1:3� Bonjour - 4 �/#1:3�
                �/*2:3�
              �/#1:2�
            �/*2:2�
          �/#1:1�
        �/*3:1�
        �#4� Bonjour - 5 �/#4�
      `;
      expect(i18nPostprocess(generated.replace(/\s+/g, ''))).toEqual(final.replace(/\s+/g, ''));
    });

    it('should throw in case we have invalid string', () => {
      const arr = ['�*1:1��#2:1�', '�#4:2�', '�6:4�', '�/#2:1��/*1:1�'];
      const str = `[${arr.join('|')}]`;

      const cases = [
        // less placeholders than we have
        [`Start: ${str}, ${str} and ${str} end.`, {}],

        // more placeholders than we have
        [`Start: ${str}, ${str} and ${str}, ${str} ${str} end.`, {}],

        // not enough ICU replacements
        ['My ICU #1: �I18N_EXP_ICU�, My ICU #2: �I18N_EXP_ICU�', {ICU: ['ICU_VALUE_1']}]
      ];
      cases.forEach(([input, replacements, output]) => {
        expect(() => i18nPostprocess(input as string, replacements as any)).toThrowError();
      });
    });
  });

});
