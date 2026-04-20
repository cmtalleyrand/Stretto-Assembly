import type { StrettoViewProps } from '../../StrettoView';
import type { UseStrettoAssemblyProps } from '../../../hooks/useStrettoAssembly';
import type {
  AssemblyGateway,
  PlaybackGateway,
  SearchGateway,
  SubjectRepository,
} from './gateways';

type Assert<T extends true> = T;
type IsAssignable<Expected, Actual> = Actual extends Expected ? true : false;

type StrettoViewGatewayShape = NonNullable<StrettoViewProps['gateways']>;

// Presentation contract check: StrettoView gateways are abstraction-typed.
type _StrettoViewSearchGatewayContract = Assert<
  IsAssignable<SearchGateway | undefined, StrettoViewGatewayShape['search']>
>;
type _StrettoViewPlaybackGatewayContract = Assert<
  IsAssignable<PlaybackGateway | undefined, StrettoViewGatewayShape['playback']>
>;
type _StrettoViewSubjectRepositoryContract = Assert<
  IsAssignable<SubjectRepository | undefined, StrettoViewGatewayShape['subjects']>
>;
type _StrettoViewAssemblyGatewayContract = Assert<
  IsAssignable<AssemblyGateway | undefined, StrettoViewGatewayShape['assembly']>
>;

// Hook contract check: orchestration hook consumes AssemblyGateway abstraction.
type _UseStrettoAssemblyContract = Assert<
  IsAssignable<AssemblyGateway | undefined, UseStrettoAssemblyProps['assemblyGateway']>
>;

export {};
