import {Entry, Outcome} from '@alinea/core'
import {Functions} from '@alinea/store/sqlite/Functions'
import {useCallback, useEffect, useMemo, useState} from 'react'
import {useQuery} from 'react-query'
import {useDashboard} from '../hook/UseDashboard'
import {useSession} from '../hook/UseSession'

type QueryParams = {
  workspace: string
  root: string
  open: Array<string>
  hidden: Array<string>
}

function query({workspace, root, open, hidden}: QueryParams) {
  const Parent = Entry.as('Parent')
  const condition = Entry.parent
    .isIn(open)
    .or(Entry.id.isIn(open))
    .or(Entry.parent.isNull())
  return Entry.where(condition)
    .where(Entry.workspace.is(workspace))
    .where(Entry.root.is(root))
    .where(Entry.type.isNotIn(hidden))
    .select({
      title: Entry.title,
      id: Entry.id,
      index: Entry.index,
      workspace: Entry.workspace,
      root: Entry.root,
      type: Entry.type,
      url: Entry.url,
      parent: Entry.parent,
      parents: Entry.parents,
      $isContainer: Entry.$isContainer,
      childrenCount: Parent.where(Parent.parent.is(Entry.id))
        .select(Functions.count())
        .first()
    })
    .orderBy(Entry.index.asc())
}

type UseContentTreeOptions = {
  workspace: string
  root: string
  select: Array<string>
}

export function useContentTree({
  workspace,
  root,
  select
}: UseContentTreeOptions) {
  const {config} = useDashboard()
  const {hub} = useSession()
  const [open, setOpen] = useState(() => new Set<string>(select))
  const isOpen = useCallback((id: string) => open.has(id), [open])
  const toggleOpen = useCallback(
    (id: string) => {
      setOpen(currentOpen => {
        const res = new Set(currentOpen)
        if (res.has(id)) res.delete(id)
        else res.add(id)
        return res
      })
    },
    [setOpen]
  )
  const hidden = useMemo(() => {
    const schema = config.workspaces[workspace].schema
    return Array.from(schema)
      .filter(([, type]) => type.options.isHidden)
      .map(([key]) => key)
  }, [workspace])
  const ids = Array.from(new Set([...open, ...select])).sort()
  const {data, refetch} = useQuery(
    ['tree', workspace, root, ids.join('.')],
    () => {
      return hub
        .query(query({workspace, root, open: ids, hidden}))
        .then(Outcome.unpack)
    },
    {
      keepPreviousData: true,
      suspense: true,
      cacheTime: 0,
      refetchOnWindowFocus: false
    }
  )
  const entries = data!.filter(entry => {
    return entry.parents.reduce<boolean>(
      (acc, parent) => acc && open.has(parent),
      true
    )
  })

  useEffect(() => {
    setOpen(current => new Set([...current, ...select]))
  }, [select.join('.')])
  return {entries, isOpen, toggleOpen, refetch}
}
